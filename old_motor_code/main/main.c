#include "motor.h"
#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void app_main(void)
{
    motor_init();

    motor_on(MOTOR_1);
    motor_on(MOTOR_2);

    while (1)
    {
        motor_increase_speed(MOTOR_1, 300);
        motor_increase_speed(MOTOR_2, 300);
        vTaskDelay(pdMS_TO_TICKS(500));

        motor_decrease_speed(MOTOR_1, 300);
        motor_decrease_speed(MOTOR_2, 300);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
