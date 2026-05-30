#ifndef ATTITUDE_H_
#define ATTITUDE_H_

#include "imu.h"

typedef struct {
    float roll;     /* deg, +right */
    float pitch;    /* deg, +nose-up */
    float yaw;      /* deg, +CCW from above (free-running, no magnetometer) */
} attitude_t;

void attitude_reset(void);

void attitude_update(const imu_sample_t *s, float dt, attitude_t *out);

#endif /* ATTITUDE_H_ */
