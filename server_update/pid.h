#ifndef PID_H_
#define PID_H_

typedef struct {
    float kp, ki, kd;
    float i_acc;        /* integrator state */
    float prev_meas;    /* for derivative-on-measurement */
    float i_limit;      /* symmetric clamp on i_acc */
    float out_limit;    /* symmetric clamp on output  */
    int   has_prev;     /* skip D term on first call */
} pid_t;

void pid_init(pid_t *p, float kp, float ki, float kd,
              float i_limit, float out_limit);
void pid_reset(pid_t *p);
float pid_step(pid_t *p, float setpoint, float measurement, float dt);

#endif /* PID_H_ */
