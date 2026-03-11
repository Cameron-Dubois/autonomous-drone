/**
 * motor_test.c — standalone motor spin test
 *
 * Flashes all 4 motors at 20% speed for 3 seconds, then stops.
 * To use: temporarily rename this to main.c (backup original first).
 *
 * GPIO mapping:
 *   Motor 1: PWM=6  DIR=7
 *   Motor 2: PWM=8  DIR=9
 *   Motor 3: PWM=0  DIR=1
 *   Motor 4: PWM=4  DIR=5
 */

#include "motor.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define DUTY_20PCT 1638  // 20% of 8191 (13-bit)

static const char *TAG = "motor_test";

void app_main(void)
{
    ESP_LOGI(TAG, "=== Motor Test Start ===");
    motors_init();

    // Turn all motors on at 20%
    for (int i = 0; i < 4; i++) {
        motor_set_speed((motor_t)i, DUTY_20PCT);
        motor_set_on_off((motor_t)i, true);
        ESP_LOGI(TAG, "Motor %d ON at 20%%", i + 1);
        vTaskDelay(pdMS_TO_TICKS(200)); // stagger start to avoid current spike
    }

    ESP_LOGI(TAG, "All motors running for 3 seconds...");
    vTaskDelay(pdMS_TO_TICKS(3000));

    motors_stop_all();
    ESP_LOGI(TAG, "=== Motor Test Done ===");
}
