#pragma once
#include <stdint.h>

typedef enum {
    MOTOR_1 = 0,
    MOTOR_2 = 1,
    MOTOR_3 = 2,
    MOTOR_4 = 3
} motor_t;

void motors_init(void);
void motor_set_throttle(motor_t motor, int throttle_pct);
void motors_stop_all(void);
void motors_tick(void);
