#include "mixer.h"

static inline float clampf(float v, float lo, float hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

void mixer_compute(float throttle,
                   float roll_cmd,
                   float pitch_cmd,
                   float yaw_cmd,
                   float out[4])
{
    float m0 = throttle + roll_cmd - pitch_cmd + yaw_cmd; /* FL, CW  */
    float m1 = throttle - roll_cmd - pitch_cmd - yaw_cmd; /* FR, CCW */
    float m2 = throttle - roll_cmd + pitch_cmd + yaw_cmd; /* RR, CW  */
    float m3 = throttle + roll_cmd + pitch_cmd - yaw_cmd; /* RL, CCW */

    float lo = m0, hi = m0;
    if (m1 < lo) lo = m1; if (m1 > hi) hi = m1;
    if (m2 < lo) lo = m2; if (m2 > hi) hi = m2;
    if (m3 < lo) lo = m3; if (m3 > hi) hi = m3;

    float shift = 0.0f;
    if (lo < 0.0f)        shift = -lo;            /* lift everything up */
    else if (hi > 1.0f)   shift = 1.0f - hi;       /* push everything down */

    m0 += shift; m1 += shift; m2 += shift; m3 += shift;

    out[0] = clampf(m0, 0.0f, 1.0f);
    out[1] = clampf(m1, 0.0f, 1.0f);
    out[2] = clampf(m2, 0.0f, 1.0f);
    out[3] = clampf(m3, 0.0f, 1.0f);
}
