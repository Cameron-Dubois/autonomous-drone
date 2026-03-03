#pragma once
#include "esp_err.h"
#include <stdbool.h>

typedef enum
{
    MOTOR_1 = 0,
    MOTOR_2 = 1,
    MOTOR_3 = 2,
    MOTOR_4 = 3
} motor_t;

// Initialize motor system
void motors_init(void);

// Increase motor speed by amount
void motor_increase_speed(motor_t motor, int amount);

// Decrease motor speed by amount
void motor_decrease_speed(motor_t motor, int amount);

// Set motor duty directly
void motor_set_speed(motor_t motor, int duty);

// Turn motor on/off
void motor_set_on_off(motor_t motor, bool on);

// Set motor direction (true=forward, false=reverse)
void motor_set_direction(motor_t motor, bool forward);

// Stop all motors immediately
void motors_stop_all(void);