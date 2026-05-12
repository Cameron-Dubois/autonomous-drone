/*
 * attitude.c - complementary filter
 *
 * Mahony / Madgwick are nicer in theory, but a tuned complementary filter
 * gives equivalent results for an angle-mode hand-flown drone and uses
 * about 1/10 the cycles.  We blend gyro integration (fast, drifty) with
 * accelerometer-derived tilt (slow, noisy when accelerating) using a
 * fixed time constant tau.
 *
 * Yaw has no absolute reference here.  If you add a magnetometer later,
 * fuse it the same way against integrated gz.
 */
#include "attitude.h"

#include <math.h>

#include "app_config.h"

/* Time constant: how strongly the accelerometer pulls roll/pitch back
 * toward truth.  Larger tau = trust the gyro more = smoother but drifts
 * slower back to level.  0.5 s is a good starting point for a small
 * quad; drop to 0.2 s if you see persistent tilt. */
#define COMPL_TAU_S     0.5f

static attitude_t s_att;

void attitude_reset(void)
{
    s_att.roll = s_att.pitch = s_att.yaw = 0.0f;
}

void attitude_update(const imu_sample_t *s, float dt, attitude_t *out)
{
    /* Accel-derived tilt.  Valid only when |a| ~ 1 g.  Under heavy
     * thrust this is wrong; the filter weighting protects us. */
    float ax = s->ax, ay = s->ay, az = s->az;
    float roll_acc  = atan2f(ay, sqrtf(ax * ax + az * az)) * (180.0f / (float)M_PI);
    float pitch_acc = atan2f(-ax, az) * (180.0f / (float)M_PI);

    /* alpha = tau / (tau + dt) */
    float alpha = COMPL_TAU_S / (COMPL_TAU_S + dt);

    /* Integrate gyro then blend with accel.  Note: small-angle
     * approximation -- yaw rate doesn't cross-couple here.  Fine
     * for a hand-flown quad; switch to a proper rotation matrix
     * if you ever need acrobatic accuracy. */
    s_att.roll  = alpha * (s_att.roll  + s->gx * dt) + (1.0f - alpha) * roll_acc;
    s_att.pitch = alpha * (s_att.pitch + s->gy * dt) + (1.0f - alpha) * pitch_acc;
    s_att.yaw  += s->gz * dt;

    /* Wrap yaw to (-180, 180] so it never overflows. */
    if (s_att.yaw >  180.0f) s_att.yaw -= 360.0f;
    if (s_att.yaw < -180.0f) s_att.yaw += 360.0f;

    *out = s_att;
}
