// motor.h — DSHOT300 ESC outputs (same protocol as motor_tests/main/motor.c).
// Duty / on-off API matches drone_ble and flight_control PID so BLE + main.c stay unchanged.

#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Physical-to-code motor mapping (matches motor_tests):
 *   MOTOR_1 = Back-Left   (GPIO 3 by default)  CCW prop
 *   MOTOR_2 = Front-Left  (GPIO 4)              CW  prop
 *   MOTOR_3 = Back-Right  (GPIO 5)              CW  prop
 *   MOTOR_4 = Front-Right (GPIO 6)              CCW prop
 *
 * GPIOs: menuconfig → Motor Configuration. */
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

/** Extra idle period while DSHOT pump runs — call once after motors_init(). */
void motors_wait_arm_ready(void);

/** Push one DSHOT frame set (4 motors); normally called from the pump task only. */
void motors_tick(void);

void motor_increase_speed(motor_t motor, int amount);
void motor_decrease_speed(motor_t motor, int amount);
void motor_set_speed(motor_t motor, int duty);

void motor_set_on_off(motor_t motor, bool on);

/** BLHeli DSHOT 20 = NORMAL, 21 = REVERSED, then save. Props OFF; power-cycle after. */
void motor_set_direction(motor_t motor, bool reversed);

/** Effective logical duty 0..1023 when motor is ON (matches spool-down bookkeeping). */
int motor_get_commanded_duty(motor_t motor);

void motors_stop_all(void);

/** GPIO bit-banged for motor_idx 0..3, or -1. */
int motor_get_gpio(int motor_idx);

#ifdef __cplusplus
}
#endif
