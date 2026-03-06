#include "motor.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"

static const char *TAG = "motor";

// Hardware mapping
static const int motor_pwm_gpios[4] = {4, 1, 8, 6}; // PWM pins IN1, IN3, IN5, IN7
static const int motor_dir_gpios[4] = {3, 0, 7, 5}; // DIR pins IN2, IN4, IN6, IN8
static const ledc_channel_t ledc_channels[4] = {
    LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3};

#define LEDC_MODE LEDC_LOW_SPEED_MODE
#define LEDC_TIMER LEDC_TIMER_0
#define LEDC_DUTY_RES LEDC_TIMER_13_BIT
#define LEDC_FREQUENCY 4000
#define MAX_DUTY 8191
#define MIN_DUTY 0

static int motor_duty[4] = {0, 0, 0, 0};
static bool motor_on[4] = {false, false, false, false};

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing motors...");

    // Configure direction pins
    uint64_t pin_mask = 0;
    for (int i = 0; i < 4; i++)
        pin_mask |= (1ULL << motor_dir_gpios[i]);

    gpio_config_t dir_conf = {
        .pin_bit_mask = pin_mask,
        .mode = GPIO_MODE_OUTPUT,
        .pull_down_en = 0,
        .pull_up_en = 0,
        .intr_type = GPIO_INTR_DISABLE};
    gpio_config(&dir_conf);

    // Set all forward
    for (int i = 0; i < 4; i++)
        gpio_set_level(motor_dir_gpios[i], 0);

    // Configure PWM timer
    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz = LEDC_FREQUENCY,
        .clk_cfg = LEDC_AUTO_CLK};
    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));

    // Configure PWM channels, all starting at duty=0 (stopped)
    for (int i = 0; i < 4; i++)
    {
        ledc_channel_config_t channel_conf = {
            .speed_mode = LEDC_MODE,
            .channel = ledc_channels[i],
            .timer_sel = LEDC_TIMER,
            .intr_type = LEDC_INTR_DISABLE,
            .gpio_num = motor_pwm_gpios[i],
            .duty = 0,
            .hpoint = 0};
        ESP_ERROR_CHECK(ledc_channel_config(&channel_conf));
    }

    ESP_LOGI(TAG, "Motors initialized (all off)");
}

static void motor_apply_duty(motor_t motor)
{
    int duty = motor_on[motor] ? motor_duty[motor] : 0;
    ESP_LOGI(TAG, "Motor %d -> duty %d", motor + 1, duty);
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, ledc_channels[motor], duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, ledc_channels[motor]));
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
    for (int i = 0; i < 4; i++)
    {
        motor_on[i] = false;
        motor_apply_duty(i);
    }
}
