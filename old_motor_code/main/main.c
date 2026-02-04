#include <stdio.h>
#include "driver/ledc.h"
#include "esp_err.h"
#include "hal/gpio_types.h"

// Define speed pins (PWM control)
#define MOTOR_IN1_GPIO 4
#define MOTOR_IN3_GPIO 1
#define MOTOR_IN5_GPIO 8
#define MOTOR_IN7_GPIO 6

// Define direction pins
#define MOTOR_IN2_GPIO 3
#define MOTOR_IN4_GPIO 0
#define MOTOR_IN6_GPIO 7
#define MOTOR_IN8_GPIO 5

// PWM config
#define LEDC_MODE        LEDC_LOW_SPEED_MODE
#define LEDC_TIMER       LEDC_TIMER_0
#define LEDC_DUTY_RES    LEDC_TIMER_13_BIT
#define LEDC_FREQUENCY   4000
#define LEDC_DUTY        4096 // 50%

void init_direction_pins(void) {
    uint64_t dir_pins = (1ULL << MOTOR_IN2_GPIO) |
                        (1ULL << MOTOR_IN4_GPIO) |
                        (1ULL << MOTOR_IN6_GPIO) |
                        (1ULL << MOTOR_IN8_GPIO);

    gpio_config_t dir_conf = {
        .pin_bit_mask = dir_pins,
        .mode = GPIO_MODE_OUTPUT,
        .pull_down_en = 0,
        .pull_up_en = 0,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&dir_conf);

    // Set direction LOW (e.g., forward)
    gpio_set_level(MOTOR_IN2_GPIO, 0);
    gpio_set_level(MOTOR_IN4_GPIO, 0);
    gpio_set_level(MOTOR_IN6_GPIO, 0);
    gpio_set_level(MOTOR_IN8_GPIO, 0);
}

void init_pwm_channels(void) {
    // Configure timer
    ledc_timer_config_t ledc_timer = {
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz = LEDC_FREQUENCY,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK(ledc_timer_config(&ledc_timer));

    // PWM channels for each motor
    const int motor_pwms[4] = { MOTOR_IN1_GPIO, MOTOR_IN3_GPIO, MOTOR_IN5_GPIO, MOTOR_IN7_GPIO };
    const ledc_channel_t ledc_channels[4] = {
        LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3
    };

    for (int i = 0; i < 4; i++) {
        ledc_channel_config_t channel = {
            .speed_mode = LEDC_MODE,
            .channel = ledc_channels[i],
            .timer_sel = LEDC_TIMER,
            .intr_type = LEDC_INTR_DISABLE,
            .gpio_num = motor_pwms[i],
            .duty = 0,
            .hpoint = 0
        };
        ESP_ERROR_CHECK(ledc_channel_config(&channel));
    }

    // Set all motor PWMs to 50%
    for (int i = 0; i < 4; i++) {
        ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, ledc_channels[i], LEDC_DUTY));
        ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, ledc_channels[i]));
    }
}

void app_main(void) {
    init_direction_pins();
    init_pwm_channels();
}
