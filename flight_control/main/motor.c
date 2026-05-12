// motor.c — DSHOT300 bit-bang (same algorithm as motor_tests/main/motor.c).
// Exposes the flight_control / drone_ble shape: duty 0..1023, on/off, spool helpers.

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

static const int motor_gpios[MOTOR_COUNT] = {
    CONFIG_MOTOR_1_PWM_GPIO,
    CONFIG_MOTOR_2_PWM_GPIO,
    CONFIG_MOTOR_3_PWM_GPIO,
    CONFIG_MOTOR_4_PWM_GPIO,
};

int motor_get_gpio(int motor_idx)
{
    if (motor_idx < 0 || motor_idx > 3) return -1;
    return motor_gpios[motor_idx];
}

#define DSHOT_MIN  48
#define DSHOT_MAX  2047

#if defined(CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ) && CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ > 0
#define CPU_HZ_MHZ  CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ
#else
#define CPU_HZ_MHZ  160
#endif

#define BIT_TOTAL_CY      ((CPU_HZ_MHZ * 1000) / 300)
#define BIT_T1H_CY        ((BIT_TOTAL_CY * 75) / 100)
#define BIT_T0H_CY        ((BIT_TOTAL_CY * 375) / 1000)

#define GPIO_SET(pin)  REG_WRITE(GPIO_OUT_W1TS_REG, (1UL << (pin)))
#define GPIO_CLR(pin)  REG_WRITE(GPIO_OUT_W1TC_REG, (1UL << (pin)))

/*
 * DSHOT pump must stay below the NimBLE host task or advertising/sync stalls.
 * (Typical CONFIG_BT_NIMBLE_TASK_PRIORITY is ~18–21 on ESP-IDF.)
 */
#if defined(CONFIG_BT_NIMBLE_TASK_PRIORITY) && CONFIG_BT_NIMBLE_TASK_PRIORITY > 5
#define MOTOR_DSHOT_TASK_PRIO  ((CONFIG_BT_NIMBLE_TASK_PRIORITY / 2) > 3 ? (CONFIG_BT_NIMBLE_TASK_PRIORITY / 2) : 3)
#else
#define MOTOR_DSHOT_TASK_PRIO  8
#endif

/* Logical flight duty + enable; converted to DSHOT 11-bit under g_state_mux. */
static int      motor_duty[MOTOR_COUNT]  = {0, 0, 0, 0};
static bool     motor_on[MOTOR_COUNT]    = {false, false, false, false};
static uint16_t g_dshot_throttle[4]      = {0, 0, 0, 0};

static portMUX_TYPE g_state_mux = portMUX_INITIALIZER_UNLOCKED;

/* Spinlock around each 16-bit DSHOT frame (matches motor_tests). */
static portMUX_TYPE g_dshot_mux = portMUX_INITIALIZER_UNLOCKED;

static TaskHandle_t s_pump_task = NULL;

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

static void refresh_dshot_for_motor(motor_t m)
{
    int mi = (int)m;
    if (!motor_on[mi] || motor_duty[mi] <= 0) {
        g_dshot_throttle[mi] = 0;
        return;
    }
    int d = motor_duty[mi];
    if (d > MAX_DUTY) d = MAX_DUTY;
    g_dshot_throttle[mi] = (uint16_t)(DSHOT_MIN +
        (int64_t)d * (DSHOT_MAX - DSHOT_MIN) / MAX_DUTY);
}

void IRAM_ATTR motors_tick(void)
{
    uint16_t tq[4];
    portENTER_CRITICAL(&g_state_mux);
    for (int i = 0; i < 4; i++)
        tq[i] = g_dshot_throttle[i];
    portEXIT_CRITICAL(&g_state_mux);

    for (int i = 0; i < 4; i++)
        dshot_send(motor_gpios[i], dshot_make_frame(tq[i], false));
}

static void motor_dshot_pump_task(void *arg)
{
    (void)arg;
    const int spacing_us = 300;
    for (;;) {
        motors_tick();
        esp_rom_delay_us(spacing_us);
    }
}

static void ensure_pump_started(void)
{
    if (s_pump_task != NULL)
        return;
    const BaseType_t ok = xTaskCreate(
        motor_dshot_pump_task,
        "dshot_pump",
        3072,
        NULL,
        MOTOR_DSHOT_TASK_PRIO,
        &s_pump_task);
    if (ok != pdPASS) {
        ESP_LOGE(TAG, "Failed to start DSHOT pump task");
        s_pump_task = NULL;
    } else {
        ESP_LOGI(TAG, "DSHOT pump task started");
    }
}

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing DSHOT300 (same as motor_tests; CPU %d MHz)",
             (int)CPU_HZ_MHZ);
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

    portENTER_CRITICAL(&g_state_mux);
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_duty[i]  = 0;
        motor_on[i]    = false;
        g_dshot_throttle[i] = 0;
    }
    portEXIT_CRITICAL(&g_state_mux);

    ESP_LOGI(TAG, "Signals: M1=GPIO%d M2=GPIO%d M3=GPIO%d M4=GPIO%d",
             motor_gpios[0], motor_gpios[1], motor_gpios[2], motor_gpios[3]);

    ESP_LOGI(TAG, "Sending disarm frames for 2 s to arm ESCs...");
    int64_t t0 = esp_timer_get_time();
    int yield_ctr = 0;
    while (esp_timer_get_time() - t0 < 2000000) {
        motors_tick();
        esp_rom_delay_us(300);
        /* Yield so NimBLE + idle tasks run; a pure 2 s busy loop prevented BLE from ever
         * advertising (and can trip the task watchdog on app_main). */
        if (++yield_ctr >= 32) {
            yield_ctr = 0;
            vTaskDelay(1);
        }
    }
    ESP_LOGI(TAG, "ESC init burst complete");

    ensure_pump_started();
}

void motors_wait_arm_ready(void)
{
    portENTER_CRITICAL(&g_state_mux);
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_on[i]   = false;
        motor_duty[i] = 0;
        refresh_dshot_for_motor((motor_t)i);
    }
    portEXIT_CRITICAL(&g_state_mux);

    ESP_LOGI(TAG, "Extra 3 s idle DSHOT so ESCs settle...");
    vTaskDelay(pdMS_TO_TICKS(3000));
    ESP_LOGI(TAG, "Motor outputs ready");
}

void motor_increase_speed(motor_t motor, int amount)
{
    portENTER_CRITICAL(&g_state_mux);
    motor_duty[motor] += amount;
    if (motor_duty[motor] > MAX_DUTY)
        motor_duty[motor] = MAX_DUTY;
    refresh_dshot_for_motor(motor);
    portEXIT_CRITICAL(&g_state_mux);
}

void motor_decrease_speed(motor_t motor, int amount)
{
    portENTER_CRITICAL(&g_state_mux);
    motor_duty[motor] -= amount;
    if (motor_duty[motor] < MIN_DUTY)
        motor_duty[motor] = MIN_DUTY;
    refresh_dshot_for_motor(motor);
    portEXIT_CRITICAL(&g_state_mux);
}

void motor_set_speed(motor_t motor, int duty)
{
    if (duty > MAX_DUTY)
        duty = MAX_DUTY;
    if (duty < MIN_DUTY)
        duty = MIN_DUTY;
    portENTER_CRITICAL(&g_state_mux);
    motor_duty[motor] = duty;
    refresh_dshot_for_motor(motor);
    portEXIT_CRITICAL(&g_state_mux);
}

void motor_set_on_off(motor_t motor, bool on)
{
    portENTER_CRITICAL(&g_state_mux);
    motor_on[motor] = on;
    refresh_dshot_for_motor(motor);
    portEXIT_CRITICAL(&g_state_mux);
    ESP_LOGI(TAG, "Motor %d %s", motor + 1, on ? "ON" : "OFF");
}

int motor_get_commanded_duty(motor_t motor)
{
    if ((int)motor < 0 || (int)motor >= MOTOR_COUNT)
        return 0;
    portENTER_CRITICAL(&g_state_mux);
    int d = motor_on[motor] ? motor_duty[motor] : 0;
    portEXIT_CRITICAL(&g_state_mux);
    return d;
}

/* Send a DSHOT special command to one motor while others get disarm (0). */
static void send_command_burst(motor_t motor, uint16_t cmd, int repeats)
{
    for (int r = 0; r < repeats; r++) {
        for (int j = 0; j < 4; j++) {
            uint16_t value = (j == (int)motor) ? cmd : 0;
            bool telem = (j == (int)motor);
            dshot_send(motor_gpios[j], dshot_make_frame(value, telem));
        }
        esp_rom_delay_us(1000);
    }
}

void motor_set_direction(motor_t motor, bool reversed)
{
    if (s_pump_task != NULL)
        vTaskSuspend(s_pump_task);

    const uint16_t DSHOT_CMD_SPIN_DIRECTION_NORMAL   = 20;
    const uint16_t DSHOT_CMD_SPIN_DIRECTION_REVERSED = 21;
    const uint16_t DSHOT_CMD_SAVE_SETTINGS           = 12;

    uint16_t dir_cmd = reversed
        ? DSHOT_CMD_SPIN_DIRECTION_REVERSED
        : DSHOT_CMD_SPIN_DIRECTION_NORMAL;

    ESP_LOGI(TAG, "Motor %d: BLHeli direction = %s",
             (int)motor + 1, reversed ? "REVERSED" : "NORMAL");

    send_command_burst(motor, dir_cmd, 10);
    send_command_burst(motor, DSHOT_CMD_SAVE_SETTINGS, 10);

    int64_t t0 = esp_timer_get_time();
    int y = 0;
    while (esp_timer_get_time() - t0 < 500000) {
        motors_tick();
        esp_rom_delay_us(300);
        if (++y >= 32) {
            y = 0;
            vTaskDelay(1);
        }
    }

    if (s_pump_task != NULL)
        vTaskResume(s_pump_task);
}

void motors_stop_all(void)
{
    ESP_LOGI(TAG, "Stopping all motors (DSHOT 0)");
    portENTER_CRITICAL(&g_state_mux);
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_on[i]   = false;
        motor_duty[i] = 0;
        refresh_dshot_for_motor((motor_t)i);
    }
    portEXIT_CRITICAL(&g_state_mux);
}
