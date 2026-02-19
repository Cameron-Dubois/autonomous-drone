#pragma once

#include "esp_err.h"

typedef enum
{
    MOTOR_1 = 0,
    MOTOR_2,
    MOTOR_MAX
} motor_t;

void motor_init(void);

esp_err_t motor_on(motor_t motor);
esp_err_t motor_off(motor_t motor);

esp_err_t motor_increase_speed(motor_t motor, int amount);
esp_err_t motor_decrease_speed(motor_t motor, int amount);
