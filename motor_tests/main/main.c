#include "motor.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor_test";

void app_main(void)
{
    motors_init();

    for (int speed_pct = 10; speed_pct <= 100; speed_pct += 5)
    {
        int duty = (1023 * speed_pct) / 100;
        for (int i = 0; i < 4; i++)
        {
            motor_set_speed((motor_t)i, duty);
            motor_set_on_off((motor_t)i, true);
        }
        ESP_LOGI(TAG, "All motors at %d%% (duty=%d)", speed_pct, duty);
        vTaskDelay(pdMS_TO_TICKS(2000));
    }

    motors_stop_all();
    ESP_LOGI(TAG, "Done");
}
