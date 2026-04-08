//motor.h
//brushed motor driver — matches the drone_ble API so the BLE GATT layer
//and mobile app can drive motors with the same function calls

#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MOTOR_1 = 0,
    MOTOR_2 = 1,
    MOTOR_3 = 2,
    MOTOR_4 = 3
} motor_t;

#define MOTOR_COUNT  4
#define MAX_DUTY     1023
#define MIN_DUTY     0

void motors_init(void);

void motor_increase_speed(motor_t motor, int amount);
void motor_decrease_speed(motor_t motor, int amount);
void motor_set_speed(motor_t motor, int duty);

void motor_set_on_off(motor_t motor, bool on);
void motor_set_direction(motor_t motor, bool forward);

void motors_stop_all(void);

#ifdef __cplusplus
}
#endif
