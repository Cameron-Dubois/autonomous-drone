#include "motor.h"
#include "driver/gpio.h"
#include "soc/gpio_reg.h"
#include "esp_attr.h"
#include "esp_cpu.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor";

static const int motor_gpios[4] = {3, 4, 5, 6};

#define DSHOT_MIN  48
#define DSHOT_MAX  2047

/*
 * DSHOT300 timing, expressed in CPU cycles.
 * ESP32-C3 runs at 160 MHz by default (CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ=160).
 *   bit period  = 3.333 us  -> 533 cycles
 *   T1 high     = 2.500 us  -> 400 cycles  (75% of bit period)
 *   T0 high     = 1.250 us  -> 200 cycles  (37.5% of bit period)
 */
#define CPU_HZ_MHZ        160
#define BIT_TOTAL_CY      ((CPU_HZ_MHZ * 1000) / 300)
#define BIT_T1H_CY        ((BIT_TOTAL_CY * 75) / 100)
#define BIT_T0H_CY        ((BIT_TOTAL_CY * 375) / 1000)

#define GPIO_SET(pin)  REG_WRITE(GPIO_OUT_W1TS_REG, (1UL << (pin)))
#define GPIO_CLR(pin)  REG_WRITE(GPIO_OUT_W1TC_REG, (1UL << (pin)))

static uint16_t g_throttle[4] = {0, 0, 0, 0};

/* Spinlock used to disable interrupts during a single 16-bit DSHOT frame.
 * On the single-core C3 this just enters a critical section (~50 us). */
static portMUX_TYPE g_dshot_mux = portMUX_INITIALIZER_UNLOCKED;

static inline uint32_t IRAM_ATTR ccount(void)
{
    return esp_cpu_get_cycle_count();
}

static inline void IRAM_ATTR wait_until(uint32_t deadline)
{
    while ((int32_t)(ccount() - deadline) < 0) { }
}

static uint16_t dshot_make_frame(uint16_t value11, bool telemetry)
{
    uint16_t v   = ((value11 & 0x07FF) << 1) | (telemetry ? 1 : 0);
    uint8_t  crc = (v ^ (v >> 4) ^ (v >> 8)) & 0x0F;
    return (v << 4) | crc;
}

/* Bit-bangs one DSHOT300 frame on `gpio`. Cycle-accurate, IRQs off. */
static void IRAM_ATTR dshot_send(int gpio, uint16_t frame)
{
    portENTER_CRITICAL(&g_dshot_mux);

    uint32_t t = ccount();
    for (int i = 15; i >= 0; i--) {
        bool bit = (frame >> i) & 1;
        uint32_t high_until = t + (bit ? BIT_T1H_CY : BIT_T0H_CY);
        uint32_t end_of_bit = t + BIT_TOTAL_CY;

        GPIO_SET(gpio);
        wait_until(high_until);
        GPIO_CLR(gpio);
        wait_until(end_of_bit);

        t = end_of_bit;
    }

    portEXIT_CRITICAL(&g_dshot_mux);
}

void IRAM_ATTR motors_tick(void)
{
    for (int i = 0; i < 4; i++)
        dshot_send(motor_gpios[i], dshot_make_frame(g_throttle[i], false));
}

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing DSHOT300 (cycle-accurate, IRQs masked per frame)");
    ESP_LOGI(TAG, "Bit cycles: total=%d, T1H=%d, T0H=%d",
             BIT_TOTAL_CY, BIT_T1H_CY, BIT_T0H_CY);

    for (int i = 0; i < 4; i++) {
        gpio_config_t cfg = {
            .pin_bit_mask = (1ULL << motor_gpios[i]),
            .mode         = GPIO_MODE_OUTPUT,
            .pull_up_en   = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type    = GPIO_INTR_DISABLE,
        };
        gpio_config(&cfg);
        GPIO_CLR(motor_gpios[i]);
    }

    ESP_LOGI(TAG, "Sending disarm frames for 2 s to arm ESCs...");
    int64_t t0 = esp_timer_get_time();
    while (esp_timer_get_time() - t0 < 2000000) {
        motors_tick();
        /* DSHOT frame rate cap: ~3 kHz is plenty, lets other tasks run. */
        esp_rom_delay_us(300);
    }
    ESP_LOGI(TAG, "ESCs armed");
}

void motor_set_throttle(motor_t motor, int throttle_pct)
{
    if (throttle_pct < 0)   throttle_pct = 0;
    if (throttle_pct > 100) throttle_pct = 100;

    uint16_t val = (throttle_pct == 0)
        ? 0
        : (uint16_t)(DSHOT_MIN + throttle_pct * (DSHOT_MAX - DSHOT_MIN) / 100);

    g_throttle[motor] = val;
}

void motors_stop_all(void)
{
    ESP_LOGI(TAG, "Stopping all motors");
    for (int i = 0; i < 4; i++)
        g_throttle[i] = 0;
}

/* Send a DSHOT special command to one motor while keeping the others
 * receiving disarm frames (so they stay armed and ignore the command). */
static void send_command_burst(motor_t motor, uint16_t cmd, int repeats)
{
    for (int r = 0; r < repeats; r++) {
        for (int j = 0; j < 4; j++) {
            uint16_t value = (j == (int)motor) ? cmd : 0;
            /* Special commands require the telemetry bit set. */
            bool telem = (j == (int)motor);
            dshot_send(motor_gpios[j], dshot_make_frame(value, telem));
        }
        /* BLHeli wants >= 1 ms gap between consecutive special commands. */
        esp_rom_delay_us(1000);
    }
}

void motor_set_direction(motor_t motor, bool reversed)
{
    const uint16_t DSHOT_CMD_SPIN_DIRECTION_NORMAL   = 20;
    const uint16_t DSHOT_CMD_SPIN_DIRECTION_REVERSED = 21;
    const uint16_t DSHOT_CMD_SAVE_SETTINGS           = 12;

    uint16_t dir_cmd = reversed
        ? DSHOT_CMD_SPIN_DIRECTION_REVERSED
        : DSHOT_CMD_SPIN_DIRECTION_NORMAL;

    ESP_LOGI(TAG, "Motor %d: setting direction = %s",
             (int)motor + 1, reversed ? "REVERSED" : "NORMAL");

    /* Per BLHeli: each special command must be sent 6 times, then save 6 times. */
    send_command_burst(motor, dir_cmd, 10);
    send_command_burst(motor, DSHOT_CMD_SAVE_SETTINGS, 10);

    /* ESC reboots after save -> resend disarm for ~500 ms to re-arm cleanly. */
    int64_t t0 = esp_timer_get_time();
    while (esp_timer_get_time() - t0 < 500000) {
        motors_tick();
        esp_rom_delay_us(300);
    }
}
