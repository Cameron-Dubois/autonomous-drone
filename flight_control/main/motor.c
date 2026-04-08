//motor.c
//brushed motor driver using LEDC PWM + GPIO direction pins
//API matches drone_ble/motor.c so the BLE command layer works unchanged
//GPIOs come from Kconfig so they can be set per-board in menuconfig

#include "motor.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"

static const char *TAG = "motor";

static const int motor_pwm_gpios[MOTOR_COUNT] = {
    CONFIG_MOTOR_1_PWM_GPIO,
    CONFIG_MOTOR_2_PWM_GPIO,
    CONFIG_MOTOR_3_PWM_GPIO,
    CONFIG_MOTOR_4_PWM_GPIO,
};

static const int motor_dir_gpios[MOTOR_COUNT] = {
    CONFIG_MOTOR_1_DIR_GPIO,
    CONFIG_MOTOR_2_DIR_GPIO,
    CONFIG_MOTOR_3_DIR_GPIO,
    CONFIG_MOTOR_4_DIR_GPIO,
};

static const ledc_channel_t ledc_channels[MOTOR_COUNT] = {
    LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3,
};

#define LEDC_MODE       LEDC_LOW_SPEED_MODE
#define LEDC_TIMER_NUM  LEDC_TIMER_0
#define LEDC_DUTY_RES   LEDC_TIMER_10_BIT
#define LEDC_FREQUENCY  20000

static int  motor_duty[MOTOR_COUNT] = {0, 0, 0, 0};
static bool motor_on[MOTOR_COUNT]   = {false, false, false, false};

static void motor_apply_duty(motor_t motor)
{
    int duty = motor_on[motor] ? motor_duty[motor] : 0;
    ESP_LOGI(TAG, "Motor %d -> duty %d", motor + 1, duty);
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, ledc_channels[motor], duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, ledc_channels[motor]));
}

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing motors...");

    uint64_t pin_mask = 0;
    for (int i = 0; i < MOTOR_COUNT; i++)
        pin_mask |= (1ULL << motor_dir_gpios[i]);

    gpio_config_t dir_conf = {
        .pin_bit_mask = pin_mask,
        .mode         = GPIO_MODE_OUTPUT,
        .pull_down_en = 0,
        .pull_up_en   = 0,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&dir_conf);

    for (int i = 0; i < MOTOR_COUNT; i++)
        gpio_set_level(motor_dir_gpios[i], 0);

    ledc_timer_config_t timer_conf = {
        .speed_mode      = LEDC_MODE,
        .timer_num       = LEDC_TIMER_NUM,
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz         = LEDC_FREQUENCY,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));

    for (int i = 0; i < MOTOR_COUNT; i++) {
        ledc_channel_config_t channel_conf = {
            .speed_mode = LEDC_MODE,
            .channel    = ledc_channels[i],
            .timer_sel  = LEDC_TIMER_NUM,
            .intr_type  = LEDC_INTR_DISABLE,
            .gpio_num   = motor_pwm_gpios[i],
            .duty       = 0,
            .hpoint     = 0,
        };
        ESP_ERROR_CHECK(ledc_channel_config(&channel_conf));
    }

    ESP_LOGI(TAG, "Motors initialized (all off)");
    ESP_LOGI(TAG, "  M1: PWM=GPIO%d DIR=GPIO%d", motor_pwm_gpios[0], motor_dir_gpios[0]);
    ESP_LOGI(TAG, "  M2: PWM=GPIO%d DIR=GPIO%d", motor_pwm_gpios[1], motor_dir_gpios[1]);
    ESP_LOGI(TAG, "  M3: PWM=GPIO%d DIR=GPIO%d", motor_pwm_gpios[2], motor_dir_gpios[2]);
    ESP_LOGI(TAG, "  M4: PWM=GPIO%d DIR=GPIO%d", motor_pwm_gpios[3], motor_dir_gpios[3]);
}

void motor_increase_speed(motor_t motor, int amount)
{
    motor_duty[motor] += amount;
    if (motor_duty[motor] > MAX_DUTY)
        motor_duty[motor] = MAX_DUTY;
    motor_apply_duty(motor);
}

void motor_decrease_speed(motor_t motor, int amount)
{
    motor_duty[motor] -= amount;
    if (motor_duty[motor] < MIN_DUTY)
        motor_duty[motor] = MIN_DUTY;
    motor_apply_duty(motor);
}

void motor_set_speed(motor_t motor, int duty)
{
    if (duty > MAX_DUTY)
        duty = MAX_DUTY;
    if (duty < MIN_DUTY)
        duty = MIN_DUTY;
    motor_duty[motor] = duty;
    motor_apply_duty(motor);
}

void motor_set_on_off(motor_t motor, bool on)
{
    motor_on[motor] = on;
    ESP_LOGI(TAG, "Motor %d %s", motor + 1, on ? "ON" : "OFF");
    motor_apply_duty(motor);
}

void motor_set_direction(motor_t motor, bool forward)
{
    ESP_LOGI(TAG, "Motor %d direction: %s", motor + 1, forward ? "forward" : "reverse");
    gpio_set_level(motor_dir_gpios[motor], forward ? 0 : 1);
}

void motors_stop_all(void)
{
    ESP_LOGI(TAG, "Stopping all motors");
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_on[i] = false;
        motor_apply_duty(i);
    }
}
