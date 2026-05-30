#ifndef MOTORS_H_
#define MOTORS_H_

#include <stdbool.h>
#include "esp_err.h"

esp_err_t motors_init(void);

void motors_arm(bool armed);
bool motors_is_armed(void);

void motors_set(int idx, float v);

void motors_set_all(float m0, float m1, float m2, float m3);

#endif /* MOTORS_H_ */
