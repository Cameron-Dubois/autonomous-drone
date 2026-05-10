/*
 * motors.h - 4-channel LEDC PWM driver for brushed-motor MOSFETs
 *
 * If you swap to brushless ESCs, replace the LEDC backend with the
 * RMT or MCPWM peripheral and emit DShot/OneShot frames -- the rest
 * of the firmware (mixer, PID) is unchanged.
 */
#ifndef MOTORS_H_
#define MOTORS_H_

#include <stdbool.h>
#include "esp_err.h"

esp_err_t motors_init(void);

/* Arm/disarm gate.  Disarmed motors always output zero, even if a
 * later set() call says otherwise.  Use this to guarantee safety on
 * boot, packet timeout, or low-battery.  */
void motors_arm(bool armed);
bool motors_is_armed(void);

/* Set throttle for one motor.  v in [0.0, 1.0]. Clipped silently. */
void motors_set(int idx, float v);

/* Convenience: set all four at once (M0..M3 order from app_config.h). */
void motors_set_all(float m0, float m1, float m2, float m3);

#endif /* MOTORS_H_ */
