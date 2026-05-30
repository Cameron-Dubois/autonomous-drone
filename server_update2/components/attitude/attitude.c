/*
 * attitude.c - complementary filter
 *
 * Mahony / Madgwick are nicer in theory, but a tuned complementary filter
 * gives equivalent results for an angle-mode hand-flown drone at ~1/10
 * the cost.  We blend gyro integration (fast, drifty) with accelerometer-
 * derived tilt (slow, noisy when accelerating) using a fixed time
 * constant tau.
 *
 * Yaw has no absolute reference here.  Add a magnetometer later and
 * fuse it the same way against integrated gz.
 */
#include "attitude.h"

#include <math.h>

#include "app_config.h"

/* Larger tau = trust the gyro more = smoother but slower to settle.
 * 0.5 s works well for a small quad; drop to 0.2 s if you see
 * persistent tilt. */
#define COMPL_TAU_S     0.5f

static attitude_t s_att;

void attitude_reset(void)
{
    s_att.roll = s_att.pitch = s_att.yaw = 0.0f;
}

void attitude_update(const imu_sample_t *s, float dt, attitude_t *out)
{
    /* Accel-derived tilt -- valid only when |a| ~ 1 g.  Under heavy
     * thrust this is wrong; the filter weighting protects us. */
    float ax = s->ax, ay = s->ay, az = s->az;
    float roll_acc  = atan2f(ay, sqrtf(ax * ax + az * az)) * (180.0f / (float)M_PI);
    float pitch_acc = atan2f(-ax, az) * (180.0f / (float)M_PI);

    float alpha = COMPL_TAU_S / (COMPL_TAU_S + dt);

    /* Small-angle approximation: yaw rate doesn't cross-couple.  Fine
     * for a hand-flown quad -- switch to a proper rotation matrix if
     * you need acrobatic accuracy. */
    s_att.roll  = alpha * (s_att.roll  + s->gx * dt) + (1.0f - alpha) * roll_acc;
    s_att.pitch = alpha * (s_att.pitch + s->gy * dt) + (1.0f - alpha) * pitch_acc;
    s_att.yaw  += s->gz * dt;

    if (s_att.yaw >  180.0f) s_att.yaw -= 360.0f;
    if (s_att.yaw < -180.0f) s_att.yaw += 360.0f;

    *out = s_att;
}
