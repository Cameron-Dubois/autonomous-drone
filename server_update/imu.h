/*
 * imu.h - MPU6050 IMU driver (I2C)
 *
 * Tiny, allocation-free.  Returns calibrated gyro/accel in physical units
 * (deg/s and g) so the rest of the firmware never has to think about
 * raw sensor counts.
 */
#ifndef IMU_H_
#define IMU_H_

#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    float gx, gy, gz;   /* deg/s, body frame */
    float ax, ay, az;   /* g, body frame     */
} imu_sample_t;

/* Bring up I2C and configure the MPU6050.  Must be called once at boot. */
esp_err_t imu_init(void);

/* Sample the gyro for ~1 s while the drone is stationary and store the
 * average as gyro bias.  Call this on the bench, ideally on every boot
 * before arming -- it removes the gyro DC offset that otherwise makes
 * the integrator drift. */
esp_err_t imu_calibrate_gyro_bias(void);

/* Read one sample.  Blocks for ~250 us at 400 kHz I2C. */
esp_err_t imu_read(imu_sample_t *out);

#endif /* IMU_H_ */
