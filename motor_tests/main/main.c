#include "motor.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor_test";

static void run_for(int duration_us)
{
    int64_t end = esp_timer_get_time() + duration_us;
    while (esp_timer_get_time() < end)
        motors_tick();
}

void app_main(void)
{
    motors_init();

    while (1)
    {
        for (int pct = 10; pct <= 100; pct += 10)
        {
            for (int i = 0; i < 4; i++)
                motor_set_throttle((motor_t)i, pct);
            ESP_LOGI(TAG, "All motors at %d%%", pct);
            run_for(2000000);  /* 2 seconds at each level */
        }

        motors_stop_all();
        ESP_LOGI(TAG, "Restart...");
        run_for(2000000);
    }
}
