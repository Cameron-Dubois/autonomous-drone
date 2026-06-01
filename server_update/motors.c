#include "motors.h"

#include "driver/ledc.h"
#include "esp_log.h"

#include "app_config.h"

static const char *TAG = "motors";

#define LEDC_MODE       LEDC_LOW_SPEED_MODE
#define LEDC_TIMER      LEDC_TIMER_0

static const int s_pins[4] = { MOTOR0_GPIO, MOTOR1_GPIO, MOTOR2_GPIO, MOTOR3_GPIO };
static const ledc_channel_t s_chans[4] = {
    LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3,
};

static volatile bool s_armed = false;

esp_err_t motors_init(void)
{
    ledc_timer_config_t tcfg = {
        .speed_mode      = LEDC_MODE,
        .timer_num       = LEDC_TIMER,
        .duty_resolution = MOTOR_PWM_RES_BITS,
        .freq_hz         = MOTOR_PWM_FREQ_HZ,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    esp_err_t err = ledc_timer_config(&tcfg);
    if (err != ESP_OK) return err;

    for (int i = 0; i < 4; i++) {
        ledc_channel_config_t ccfg = {
            .gpio_num   = s_pins[i],
            .speed_mode = LEDC_MODE,
            .channel    = s_chans[i],
            .timer_sel  = LEDC_TIMER,
            .intr_type  = LEDC_INTR_DISABLE,
            .duty       = 0,
            .hpoint     = 0,
        };
        err = ledc_channel_config(&ccfg);
        if (err != ESP_OK) return err;
    }

    s_armed = false;
    ESP_LOGI(TAG, "PWM up: %d Hz, %d-bit, pins %d %d %d %d",
             MOTOR_PWM_FREQ_HZ, MOTOR_PWM_RES_BITS,
             s_pins[0], s_pins[1], s_pins[2], s_pins[3]);
    return ESP_OK;
}

void motors_arm(bool armed)
{
    s_armed = armed;
    if (!armed) {
        for (int i = 0; i < 4; i++) {
            ledc_set_duty(LEDC_MODE, s_chans[i], 0);
            ledc_update_duty(LEDC_MODE, s_chans[i]);
        }
    }
}

bool motors_is_armed(void) { return s_armed; }

static inline uint32_t to_duty(float v)
{
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    return (uint32_t)(v * (float)MOTOR_PWM_MAX);
}

void motors_set(int idx, float v)
{
    if (idx < 0 || idx > 3) return;
    if (!s_armed) v = 0.0f;
    ledc_set_duty(LEDC_MODE, s_chans[idx], to_duty(v));
    ledc_update_duty(LEDC_MODE, s_chans[idx]);
}

void motors_set_all(float m0, float m1, float m2, float m3)
{
    if (!s_armed) m0 = m1 = m2 = m3 = 0.0f;
    ledc_set_duty(LEDC_MODE, s_chans[0], to_duty(m0));
    ledc_set_duty(LEDC_MODE, s_chans[1], to_duty(m1));
    ledc_set_duty(LEDC_MODE, s_chans[2], to_duty(m2));
    ledc_set_duty(LEDC_MODE, s_chans[3], to_duty(m3));
    ledc_update_duty(LEDC_MODE, s_chans[0]);
    ledc_update_duty(LEDC_MODE, s_chans[1]);
    ledc_update_duty(LEDC_MODE, s_chans[2]);
    ledc_update_duty(LEDC_MODE, s_chans[3]);
}
