//pid.h
//single-axis PID controller with integral anti-windup, output clamping,
//and a first-order low-pass filter on the derivative input

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float p;
    float i;
    float d;
    float integral;
    float prev_error;
    float integral_limit;   //caps |integral| to prevent windup
    float output_limit;     //caps |output| to the actuator range

    //first-order IIR low-pass on the rate signal that feeds the D term.
    //gyro / d(error)/dt are noisy; without this, the D gain amplifies that
    //noise into motor chatter and 1-3 Hz limit cycles. tau is the filter
    //time constant in seconds (≈ 1 / (2π · f_cutoff)). 0 disables the filter.
    float d_filter_tau;
    float d_filter_state;
} pid_ctrl_t;

//zeros out the accumulated state (integral, previous error, D filter)
//call this when the controller is first enabled or after a mode change
void pid_reset(pid_ctrl_t *pid);

//runs one iteration of the PID loop
//setpoint: desired value (e.g. 0 degrees for level flight)
//measured: current sensor reading
//dt:       time since last call in seconds
//returns the control output, clamped to +/- output_limit
float pid_compute(pid_ctrl_t *pid, float setpoint, float measured, float dt);

// Angle loop: same P+I on angle; D uses gyro rate (deg/s), not d(error)/dt — avoids amplifying fused-angle noise.
// The gyro rate itself is low-pass filtered (d_filter_tau) before D is applied.
float pid_compute_angle(pid_ctrl_t *pid, float setpoint_deg, float angle_deg, float rate_dps, float dt);

#ifdef __cplusplus
}
#endif
