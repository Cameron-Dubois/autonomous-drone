#include "motor.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG = "main";

void app_main(void)
{
    motors_init();

    motor_set_on_off(MOTOR_1, true);
    motor_set_on_off(MOTOR_2, true);

    while (1)
    {
        // Ramp up from 0 to 6000
        ESP_LOGI(TAG, "Ramping up...");
        for (int duty = 0; duty <= 6000; duty += 200)
        {
            motor_set_speed(MOTOR_1, duty);
            motor_set_speed(MOTOR_2, duty);
            vTaskDelay(pdMS_TO_TICKS(50));
        }

        // Hold at full speed
        ESP_LOGI(TAG, "Full speed");
        vTaskDelay(pdMS_TO_TICKS(2000));

        // Ramp down from 6000 to 0
        ESP_LOGI(TAG, "Ramping down...");
        for (int duty = 6000; duty >= 0; duty -= 200)
        {
            motor_set_speed(MOTOR_1, duty);
            motor_set_speed(MOTOR_2, duty);
            vTaskDelay(pdMS_TO_TICKS(50));
        }

        // Off for 3 seconds
        ESP_LOGI(TAG, "Motors off, waiting 3s...");
        vTaskDelay(pdMS_TO_TICKS(3000));
    }
}
