#ifndef APP_CONFIG_H_
#define APP_CONFIG_H_

#include <stdint.h>

#define LOOP_HZ                 1000
#define LOOP_DT_S               (1.0f / (float)LOOP_HZ)
#define LOOP_PERIOD_US          (1000000 / LOOP_HZ)

#define IMU_I2C_PORT            0
#define IMU_I2C_SDA_GPIO        4
#define IMU_I2C_SCL_GPIO        5
#define IMU_I2C_FREQ_HZ         400000   /* 400 kHz fast mode */
#define IMU_I2C_ADDR            0x68     /* MPU6050 default; 0x69 if AD0 high */

#define MOTOR_PWM_FREQ_HZ       20000
#define MOTOR_PWM_RES_BITS      10
#define MOTOR_PWM_MAX           ((1 << MOTOR_PWM_RES_BITS) - 1)

#define WIFI_AP_SSID            "drone-c3"
#define WIFI_AP_PASSWORD        "fly12345"  
#define WIFI_AP_CHANNEL         1
#define WIFI_AP_MAX_CONN        1

#define CTRL_UDP_PORT           4242
#define TELEM_UDP_PORT          4243
#define CTRL_TIMEOUT_MS         300  

#define PID_ROLL_RATE_KP        0.0018f
#define PID_ROLL_RATE_KI        0.0040f
#define PID_ROLL_RATE_KD        0.00004f

#define PID_PITCH_RATE_KP       0.0018f
#define PID_PITCH_RATE_KI       0.0040f
#define PID_PITCH_RATE_KD       0.00004f

#define PID_YAW_RATE_KP         0.0040f
#define PID_YAW_RATE_KI         0.0050f
#define PID_YAW_RATE_KD         0.0f

#define PID_ROLL_ANGLE_KP       6.0f
#define PID_PITCH_ANGLE_KP      6.0f

#define MAX_TILT_DEG            30.0f
#define MAX_YAW_RATE_DPS        180.0f
#define MAX_RATE_DPS            400.0f  

#endif
