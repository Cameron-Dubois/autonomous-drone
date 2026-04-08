//pid.c
//PID controller implementation

#include "pid.h"

//clamp a value to +/- limit
static float clampf(float val, float limit)
{
    if (val >  limit) return  limit;
    if (val < -limit) return -limit;
    return val;
}

void pid_reset(pid_ctrl_t *pid)
{
    pid->integral   = 0.0f;
    pid->prev_error = 0.0f;
}

float pid_compute(pid_ctrl_t *pid, float setpoint, float measured, float dt)
{
    if (dt <= 0.0f) return 0.0f;

    float error = setpoint - measured;

    //integrate and clamp to prevent windup
    pid->integral += error * dt;
    pid->integral = clampf(pid->integral, pid->integral_limit);

    //derivative of the error
    float derivative = (error - pid->prev_error) / dt;
    pid->prev_error = error;

    float output = pid->p * error
                 + pid->i * pid->integral
                 + pid->d * derivative;

    return clampf(output, pid->output_limit);
}
