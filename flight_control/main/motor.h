//motor.h
//motor outputs — brushless ESC (servo-style PWM) in flight_control;
//matches the drone_ble API shape so the BLE stack can stay compatible.
//
//PWM frequency, pulse min/max, and motor GPIOs come from Kconfig
//(menuconfig → "Motor Configuration"). Defaults target the Aero Selfie
//45A 4in1 (BLHeli_S/_32/AM32 family) at 490 Hz / 1000–2000 µs.

#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Physical-to-code motor mapping VERIFIED on this drone (matches the
 * motor_tests project's motor.h):
 *   MOTOR_1 = Back-Left   (GPIO 3)  CCW prop
 *   MOTOR_2 = Front-Left  (GPIO 4)  CW  prop
 *   MOTOR_3 = Back-Right  (GPIO 5)  CW  prop
 *   MOTOR_4 = Front-Right (GPIO 6)  CCW prop
 *
 * GPIOs are configurable in Kconfig (Motor Configuration).
 *
 * NOTE: The X-mix in main.c is written in terms of MOTOR_1..MOTOR_4 and was
 * authored before this corner mapping was confirmed. Verify mix signs with
 * the bench tilt test described at the top of main.c BEFORE flying. */
typedef enum {
    MOTOR_1 = 0,
    MOTOR_2 = 1,
    MOTOR_3 = 2,
    MOTOR_4 = 3
} motor_t;

#define MOTOR_COUNT  4
#define MAX_DUTY     1023
#define MIN_DUTY     0

//configures the LEDC peripheral and starts driving idle pulses on every motor
//channel. Must be called before any other motor_* function.
void motors_init(void);

//blocks for a few seconds while the motor channels keep emitting the idle
//pulse, giving the ESC time to detect "throttle low" and arm cleanly. Without
//this, BLHeli/AM32 ESCs will beep but refuse to spin the motor.
//Call once after motors_init() and before commanding any non-zero throttle.
void motors_wait_arm_ready(void);

void motor_increase_speed(motor_t motor, int amount);
void motor_decrease_speed(motor_t motor, int amount);
void motor_set_speed(motor_t motor, int duty);

void motor_set_on_off(motor_t motor, bool on);
void motor_set_direction(motor_t motor, bool forward);

void motors_stop_all(void);

#ifdef __cplusplus
}
#endif
