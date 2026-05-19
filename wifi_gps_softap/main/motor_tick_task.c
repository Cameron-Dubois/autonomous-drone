#include "motor.h"

#include "esp_log.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor_tick";

static bool s_motors_hw_inited;
static bool s_tick_task_running;

static void motor_tick_task(void *arg)
{
    (void)arg;
    while (1) {
        motors_tick();
        /* Yield so NimBLE / Wi-Fi (single-core C3) get CPU; DSHOT still ~1 kHz. */
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

void motors_start_background_tick(void)
{
    if (s_tick_task_running) {
        return;
    }
    s_tick_task_running = true;
    xTaskCreate(motor_tick_task, "dshot_tick", 2048, NULL, 3, NULL);
    ESP_LOGI(TAG, "DSHOT background tick started");
}

void motors_runtime_prepare(void)
{
    if (!s_motors_hw_inited) {
        ESP_LOGI(TAG, "Initializing motors (ESC arm sequence)...");
        motors_init();
        s_motors_hw_inited = true;
    }
    motors_start_background_tick();
}
