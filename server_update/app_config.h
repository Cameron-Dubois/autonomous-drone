/*
 * app_config.h
 *
 * Single source of truth for hardware pins, control-loop rates, and default
 * gains.  Anything you'd change between revisions of the airframe lives
 * here -- nothing else in the firmware should hard-code a pin number.
 *
 * Pure C, no C++ types.  Safe to include from any compilation unit.
 */
#ifndef APP_CONFIG_H_
#define APP_CONFIG_H_

#include <stdint.h>

/* ------------------------------------------------------------------ */
/* Control rates                                                       */
/* ------------------------------------------------------------------ */
/* The inner rate-PID + IMU read runs at LOOP_HZ.  1 kHz is a sweet
 * spot for an MPU6050 with the DLPF at 98 Hz: enough margin that we
 * never miss a sample, low enough that the C3 has cycles left over
 * for WiFi.  If you bump this, re-check the I2C bus timing and the
 * task watchdog feed interval. */
#define LOOP_HZ                 1000
#define LOOP_DT_S               (1.0f / (float)LOOP_HZ)
#define LOOP_PERIOD_US          (1000000 / LOOP_HZ)

/* ------------------------------------------------------------------ */
/* I2C / IMU                                                           */
/* ------------------------------------------------------------------ */
#define IMU_I2C_PORT            0
#define IMU_I2C_SDA_GPIO        4
#define IMU_I2C_SCL_GPIO        5
#define IMU_I2C_FREQ_HZ         400000   /* 400 kHz fast mode */
#define IMU_I2C_ADDR            0x68     /* MPU6050 default; 0x69 if AD0 high */

/* ------------------------------------------------------------------ */
/* Motor PWM (LEDC)                                                    */
/* ------------------------------------------------------------------ */
/* High-frequency PWM (~20 kHz) keeps the brushed motors quiet and out
 * of the audible range.  10-bit gives 1024 throttle levels which is
 * plenty for a hand-flown quad. */
#define MOTOR_PWM_FREQ_HZ       20000
#define MOTOR_PWM_RES_BITS      10
#define MOTOR_PWM_MAX           ((1 << MOTOR_PWM_RES_BITS) - 1)

/* X-quad layout, viewed from above with the nose forward:
 *
 *     M0 (CW)         M1 (CCW)
 *           \       /
 *            \     /
 *             \   /
 *              \ /
 *              / \
 *             /   \
 *            /     \
 *           /       \
 *     M3 (CCW)        M2 (CW)
 */
#define MOTOR0_GPIO             0   /* front-left  */
#define MOTOR1_GPIO             1   /* front-right */
#define MOTOR2_GPIO             2   /* rear-right  */
#define MOTOR3_GPIO             3   /* rear-left   */

/* ------------------------------------------------------------------ */
/* WiFi                                                                */
/* ------------------------------------------------------------------ */
/* SoftAP so the drone is its own network -- one less thing to fail in
 * the field.  Channel 1 is fine for most environments; use a 5 GHz-
 * capable companion if you need range. */
#define WIFI_AP_SSID            "drone-c3"
#define WIFI_AP_PASSWORD        "fly12345"   /* >= 8 chars for WPA2 */
#define WIFI_AP_CHANNEL         1
#define WIFI_AP_MAX_CONN        1

#define CTRL_UDP_PORT           4242
#define TELEM_UDP_PORT          4243
#define CTRL_TIMEOUT_MS         300   /* failsafe: disarm if no packet */

/* ------------------------------------------------------------------ */
/* PID defaults (rate loop, deg/s -> normalized motor command)         */
/* ------------------------------------------------------------------ */
/* These are starting points for a ~70 g brushed micro-quad.  Real
 * tuning happens on the bench; expose them over telemetry so you
 * can adjust without reflashing. */
#define PID_ROLL_RATE_KP        0.0018f
#define PID_ROLL_RATE_KI        0.0040f
#define PID_ROLL_RATE_KD        0.00004f

#define PID_PITCH_RATE_KP       0.0018f
#define PID_PITCH_RATE_KI       0.0040f
#define PID_PITCH_RATE_KD       0.00004f

#define PID_YAW_RATE_KP         0.0040f
#define PID_YAW_RATE_KI         0.0050f
#define PID_YAW_RATE_KD         0.0f

/* Outer angle loop (deg -> deg/s setpoint) */
#define PID_ROLL_ANGLE_KP       6.0f
#define PID_PITCH_ANGLE_KP      6.0f

/* Stick scaling */
#define MAX_TILT_DEG            30.0f
#define MAX_YAW_RATE_DPS        180.0f
#define MAX_RATE_DPS            400.0f   /* acro-mode rate cap */

#endif /* APP_CONFIG_H_ */
