/**
 * No-op motor layer for ESP32-C3 unified firmware (pins differ from classic ESP32).
 * Keeps drone_ble gatt_svr.c command handlers linkable without driving PWM.
 */
#include "motor.h"
#include "esp_log.h"

static const char *TAG = "motor_stub";

void motors_init(void)
{
    ESP_LOGI(TAG, "motors_init (stub — no PWM on this build)");
}

void motor_increase_speed(motor_t motor, int amount)
{
    (void)motor;
    (void)amount;
}

void motor_decrease_speed(motor_t motor, int amount)
{
    (void)motor;
    (void)amount;
}

void motor_set_speed(motor_t motor, int duty)
{
    (void)motor;
    (void)duty;
}

void motor_set_on_off(motor_t motor, bool on)
{
    (void)motor;
    (void)on;
}

void motor_set_direction(motor_t motor, bool forward)
{
    (void)motor;
    (void)forward;
}

void motors_stop_all(void)
{
    ESP_LOGI(TAG, "motors_stop_all (stub)");
}
