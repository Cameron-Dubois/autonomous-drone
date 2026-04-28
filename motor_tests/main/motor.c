#include "motor.h"
#include "driver/gpio.h"
#include "soc/gpio_reg.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor";

static const int motor_gpios[4] = {3, 4, 5, 6};

#define DSHOT_MIN  48
#define DSHOT_MAX  2047

#define GPIO_SET(pin)  REG_WRITE(GPIO_OUT_W1TS_REG, (1UL << (pin)))
#define GPIO_CLR(pin)  REG_WRITE(GPIO_OUT_W1TC_REG, (1UL << (pin)))

static uint16_t g_throttle[4] = {0, 0, 0, 0};

static uint16_t dshot_make_frame(uint16_t throttle, bool telemetry)
{
    uint16_t value = (throttle << 1) | (telemetry ? 1 : 0);
    uint8_t  crc   = (value ^ (value >> 4) ^ (value >> 8)) & 0x0F;
    return (value << 4) | crc;
}

static void dshot_send(int gpio, uint16_t frame)
{
    for (int i = 15; i >= 0; i--)
    {
        bool    bit = (frame >> i) & 1;
        int64_t t   = esp_timer_get_time();
        GPIO_SET(gpio);
        while ((esp_timer_get_time() - t) < (bit ? 2 : 1));
        GPIO_CLR(gpio);
        while ((esp_timer_get_time() - t) < 3);
    }
}

void motors_tick(void)
{
    for (int i = 0; i < 4; i++)
        dshot_send(motor_gpios[i], dshot_make_frame(g_throttle[i], false));
}

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing DSHOT300...");

    for (int i = 0; i < 4; i++)
    {
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

    ESP_LOGI(TAG, "Sending disarm frames for 2 seconds to arm ESC...");
    int64_t t0 = esp_timer_get_time();
    while (esp_timer_get_time() - t0 < 2000000)
    {
        motors_tick();
    }
    ESP_LOGI(TAG, "ESC armed");
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
