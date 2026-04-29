//pid.c
//PID controller implementation
//
//Design notes:
//  * D term is driven from a low-pass-filtered rate signal, not raw d(error)/dt
//    or raw gyro. Raw rate signals on a real or simulated airframe carry enough
//    high-frequency noise that any useful D gain turns into motor chatter or a
//    slow limit-cycle oscillation. Filtering at ~20 Hz cleans this up while
//    leaving the body dynamics (a few Hz) untouched.
//  * Anti-windup uses conditional integration: the integral only accumulates
//    when the unsaturated output is inside the actuator range, OR when the new
//    error would pull the integral back toward zero. This prevents the slow
//    "wandering" that happens after the integral parks against its clamp.
//
//COPIED from flight_control/main/pid.c — keep in sync

#include <stdbool.h>
#include "pid.h"

static float clampf(float val, float limit)
{
    if (val >  limit) return  limit;
    if (val < -limit) return -limit;
    return val;
}

//first-order IIR low-pass: y[n] = y[n-1] + alpha*(x - y[n-1]) with alpha = dt/(tau+dt)
static float lpf_step(float state, float input, float tau, float dt)
{
    if (tau <= 0.0f || dt <= 0.0f) return input;
    float alpha = dt / (tau + dt);
    return state + alpha * (input - state);
}

void pid_reset(pid_ctrl_t *pid)
{
    pid->integral       = 0.0f;
    pid->prev_error     = 0.0f;
    pid->d_filter_state = 0.0f;
}

//conditional integration: add error*dt to integral only if the unclamped
//output is within range, OR the integration would shrink |integral|
//(i.e. the controller is recovering from saturation).
static void integrate_with_antiwindup(pid_ctrl_t *pid,
                                      float error,
                                      float pd_term,
                                      float dt)
{
    float candidate     = pid->integral + error * dt;
    float candidate_out = pd_term + pid->i * candidate;

    bool inside_range = (candidate_out <  pid->output_limit) &&
                        (candidate_out > -pid->output_limit);
    //allow integration if it reduces |integral| even when saturated
    bool pulling_back = (candidate * candidate) < (pid->integral * pid->integral);

    if (inside_range || pulling_back) {
        pid->integral = clampf(candidate, pid->integral_limit);
    }
}

float pid_compute(pid_ctrl_t *pid, float setpoint, float measured, float dt)
{
    if (dt <= 0.0f) return 0.0f;

    float error = setpoint - measured;

    //filter d(error)/dt to keep noise out of the D term
    float raw_deriv  = (error - pid->prev_error) / dt;
    pid->d_filter_state = lpf_step(pid->d_filter_state, raw_deriv, pid->d_filter_tau, dt);
    float derivative = pid->d_filter_state;
    pid->prev_error  = error;

    float pd = pid->p * error + pid->d * derivative;
    integrate_with_antiwindup(pid, error, pd, dt);

    float output = pd + pid->i * pid->integral;
    return clampf(output, pid->output_limit);
}

float pid_compute_angle(pid_ctrl_t *pid, float setpoint_deg, float angle_deg, float rate_dps, float dt)
{
    if (dt <= 0.0f) return 0.0f;

    float error = setpoint_deg - angle_deg;

    //setpoint constant => d(error)/dt = -d(angle)/dt ≈ -rate
    //use -D*rate (filtered) instead of noisy finite diff of the fused angle
    pid->d_filter_state = lpf_step(pid->d_filter_state, rate_dps, pid->d_filter_tau, dt);
    float filtered_rate = pid->d_filter_state;

    float pd = pid->p * error - pid->d * filtered_rate;
    integrate_with_antiwindup(pid, error, pd, dt);

    float output = pd + pid->i * pid->integral;
    pid->prev_error = error;
    return clampf(output, pid->output_limit);
}
