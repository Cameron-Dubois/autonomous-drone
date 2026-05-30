#include "pid.h"

static inline float clampf(float v, float lo, float hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

void pid_init(pid_t *p, float kp, float ki, float kd,
              float i_limit, float out_limit)
{
    p->kp = kp; p->ki = ki; p->kd = kd;
    p->i_limit   = i_limit;
    p->out_limit = out_limit;
    pid_reset(p);
}

void pid_reset(pid_t *p)
{
    p->i_acc = 0.0f;
    p->prev_meas = 0.0f;
    p->has_prev = 0;
}

float pid_step(pid_t *p, float setpoint, float measurement, float dt)
{
    float err = setpoint - measurement;

    /* Derivative on measurement (no setpoint kick). */
    float d_term = 0.0f;
    if (p->has_prev) {
        float d_meas = (measurement - p->prev_meas) / dt;
        d_term = -p->kd * d_meas;
    }
    p->prev_meas = measurement;
    p->has_prev  = 1;

    float p_term = p->kp * err;
    float i_term = p->ki * p->i_acc;
    float u_unsat = p_term + i_term + d_term;
    float u_sat   = clampf(u_unsat, -p->out_limit, p->out_limit);

    int saturated_high = (u_unsat >  p->out_limit) && (err > 0.0f);
    int saturated_low  = (u_unsat < -p->out_limit) && (err < 0.0f);
    if (!saturated_high && !saturated_low) {
        p->i_acc += err * dt;
        p->i_acc  = clampf(p->i_acc, -p->i_limit, p->i_limit);
    }

    return u_sat;
}
