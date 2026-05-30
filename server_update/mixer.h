#ifndef MIXER_H_
#define MIXER_H_

void mixer_compute(float throttle,
                   float roll_cmd,
                   float pitch_cmd,
                   float yaw_cmd,
                   float out[4]);

#endif /* MIXER_H_ */
