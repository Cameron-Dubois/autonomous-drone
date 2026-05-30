#ifndef IMU_H_
#define IMU_H_

#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    float gx, gy, gz;   /* deg/s, body frame */
    float ax, ay, az;   /* g, body frame     */
} imu_sample_t;

esp_err_t imu_init(void);

esp_err_t imu_calibrate_gyro_bias(void);

esp_err_t imu_read(imu_sample_t *out);

#endif /* IMU_H_ */
