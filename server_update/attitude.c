#include "attitude.h"

#include <math.h>

#include "app_config.h"

#define COMPL_TAU_S     0.5f

static attitude_t s_att;

void attitude_reset(void)
{
    s_att.roll = s_att.pitch = s_att.yaw = 0.0f;
}

void attitude_update(const imu_sample_t *s, float dt, attitude_t *out)
{
    float ax = s->ax, ay = s->ay, az = s->az;
    float roll_acc  = atan2f(ay, sqrtf(ax * ax + az * az)) * (180.0f / (float)M_PI);
    float pitch_acc = atan2f(-ax, az) * (180.0f / (float)M_PI);

    float alpha = COMPL_TAU_S / (COMPL_TAU_S + dt);

    s_att.roll  = alpha * (s_att.roll  + s->gx * dt) + (1.0f - alpha) * roll_acc;
    s_att.pitch = alpha * (s_att.pitch + s->gy * dt) + (1.0f - alpha) * pitch_acc;
    s_att.yaw  += s->gz * dt;

    if (s_att.yaw >  180.0f) s_att.yaw -= 360.0f;
    if (s_att.yaw < -180.0f) s_att.yaw += 360.0f;

    *out = s_att;
}
