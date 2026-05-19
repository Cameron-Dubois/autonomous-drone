#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef enum {
    MOTOR_1 = 0,   /* Back-Left   (GPIO 3) */
    MOTOR_2 = 1,   /* Front-Left  (GPIO 4) */
    MOTOR_3 = 2,   /* Back-Right  (GPIO 5) */
    MOTOR_4 = 3    /* Front-Right (GPIO 6) */
} motor_t;

void motors_init(void);
void motor_set_throttle(motor_t motor, int throttle_pct);
void motors_stop_all(void);
void motors_tick(void);

/** Start FreeRTOS task that calls motors_tick() continuously (required for DSHOT). */
void motors_start_background_tick(void);

void motor_set_direction(motor_t motor, bool reversed);
int motor_get_gpio(int motor_idx);
