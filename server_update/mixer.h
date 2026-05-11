/*
 * mixer.h - X-quad motor mixer.
 *
 * Inputs are normalized:
 *   throttle in [0, 1]
 *   roll/pitch/yaw commands in roughly [-1, +1]
 *
 * Output is four motor commands in [0, 1].
 */
#ifndef MIXER_H_
#define MIXER_H_

void mixer_compute(float throttle,
                   float roll_cmd,
                   float pitch_cmd,
                   float yaw_cmd,
                   float out[4]);

#endif /* MIXER_H_ */
