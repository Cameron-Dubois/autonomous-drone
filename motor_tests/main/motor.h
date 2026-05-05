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

/* Burn spin direction into the ESC for `motor` via DSHOT special commands
 * (20 NORMAL / 21 REVERSED) followed by SAVE_SETTINGS (12). Persistent across
 * power cycles. Run once with props OFF, then power-cycle the drone. */
void motor_set_direction(motor_t motor, bool reversed);

/* Returns the GPIO number that `motor_idx` (0..3) is bit-banged on, or -1. */
int motor_get_gpio(int motor_idx);
