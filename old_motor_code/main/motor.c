#include "motor.h"
#include "driver/ledc.h"
#include "driver/gpio.h"

#define LEDC_MODE LEDC_LOW_SPEED_MODE
#define LEDC_TIMER LEDC_TIMER_0
#define LEDC_RES LEDC_TIMER_13_BIT
#define LEDC_FREQ 4000

#define MAX_DUTY 8191
#define MIN_DUTY 0

typedef struct
{
    int pwm_gpio;
    int dir_gpio;
    ledc_channel_t channel;
    int duty;
    bool enabled;
} motor_hw_t;

/* Motor hardware table */
static motor_hw_t motors[MOTOR_MAX] = {
    [MOTOR_1] = {
        .pwm_gpio = 4, // IN1
        .dir_gpio = 3, // IN2
        .channel = LEDC_CHANNEL_0,
        .duty = 0,
        .enabled = false},
    [MOTOR_2] = {.pwm_gpio = 1, // IN3
                 .dir_gpio = 0, // IN4
                 .channel = LEDC_CHANNEL_1,
                 .duty = 0,
                 .enabled = false}};

void motor_init(void)
{
    /* Direction pins */
    gpio_config_t dir_conf = {
        .pin_bit_mask = (1ULL << motors[MOTOR_1].dir_gpio) |
                        (1ULL << motors[MOTOR_2].dir_gpio),
        .mode = GPIO_MODE_OUTPUT};
    gpio_config(&dir_conf);

    /* PWM timer */
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .duty_resolution = LEDC_RES,
        .freq_hz = LEDC_FREQ,
        .clk_cfg = LEDC_AUTO_CLK};
    ledc_timer_config(&timer);

    /* PWM channels */
    for (int i = 0; i < MOTOR_MAX; i++)
    {
        ledc_channel_config_t ch = {
            .speed_mode = LEDC_MODE,
            .channel = motors[i].channel,
            .timer_sel = LEDC_TIMER,
            .gpio_num = motors[i].pwm_gpio,
            .duty = 0,
            .hpoint = 0};
        ledc_channel_config(&ch);
        gpio_set_level(motors[i].dir_gpio, 0); // forward
    }
}

static esp_err_t set_duty(motor_t motor)
{
    return ledc_set_duty(LEDC_MODE, motors[motor].channel, motors[motor].duty) ||
           ledc_update_duty(LEDC_MODE, motors[motor].channel);
}

esp_err_t motor_on(motor_t motor)
{
    motors[motor].enabled = true;
    return set_duty(motor);
}

esp_err_t motor_off(motor_t motor)
{
    motors[motor].enabled = false;
    motors[motor].duty = 0;
    return set_duty(motor);
}

esp_err_t motor_increase_speed(motor_t motor, int amount)
{
    if (!motors[motor].enabled)
        return ESP_OK;

    motors[motor].duty += amount;
    if (motors[motor].duty > MAX_DUTY)
        motors[motor].duty = MAX_DUTY;

    return set_duty(motor);
}

esp_err_t motor_decrease_speed(motor_t motor, int amount)
{
    if (!motors[motor].enabled)
        return ESP_OK;

    motors[motor].duty -= amount;
    if (motors[motor].duty < MIN_DUTY)
        motors[motor].duty = MIN_DUTY;

    return set_duty(motor);
}
