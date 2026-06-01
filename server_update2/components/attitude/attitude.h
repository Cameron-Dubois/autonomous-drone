/*
 * attitude.h - complementary-filter attitude estimator
 */
#ifndef ATTITUDE_H_
#define ATTITUDE_H_

#include "imu.h"

typedef struct {
    float roll;     /* deg, +right */
    float pitch;    /* deg, +nose-up */
    float yaw;      /* deg, free-running */
} attitude_t;

void attitude_reset(void);

/* Advance the filter by one sample.  dt should be LOOP_DT_S. */
void attitude_update(const imu_sample_t *s, float dt, attitude_t *out);

#endif /* ATTITUDE_H_ */
