#include "driver/ledc.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor_debug";

static const int pwm_pins[] = {6, 8, 0, 4};
static const int dir_pins[] = {7, 9, 1, 5};
static const ledc_channel_t channels[] = {
    LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3};

#define DUTY_PCT(x) ((1023 * (x)) / 100)

void app_main(void)
{
    for (int i = 0; i < 4; i++)
    {
        gpio_config_t cfg = {
            .pin_bit_mask = (1ULL << dir_pins[i]),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = 0,
            .pull_down_en = 0,
            .intr_type = GPIO_INTR_DISABLE,
        };
        gpio_config(&cfg);
        gpio_set_level(dir_pins[i], 0);
    }

    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = 20000,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer);

    for (int i = 0; i < 4; i++)
    {
        ledc_channel_config_t ch = {
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .channel = channels[i],
            .timer_sel = LEDC_TIMER_0,
            .intr_type = LEDC_INTR_DISABLE,
            .gpio_num = pwm_pins[i],
            .duty = DUTY_PCT(10),
            .hpoint = 0,
        };
        ledc_channel_config(&ch);
    }

    ESP_LOGI(TAG, "All motors at 10%% — holding");
    while (1)
        vTaskDelay(pdMS_TO_TICKS(10000));
}
