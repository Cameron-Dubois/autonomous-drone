#include "demo_takeoff.h"
#include "motor.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "demo_takeoff";

#define DEMO_TAKEOFF_PCT_STEP   10
#define DEMO_TAKEOFF_PCT_MAX    25
#define DEMO_TAKEOFF_DWELL_MS   2000

static volatile bool s_abort;
static volatile bool s_running;
static TaskHandle_t s_task;

static void set_all_motors_pct(int pct)
{
    for (int i = 0; i < 4; i++) {
        motor_set_throttle((motor_t)i, pct);
    }
}

static void demo_takeoff_task(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "DEMO_TAKEOFF ramp starting (max %d%%, step %d%%)",
             DEMO_TAKEOFF_PCT_MAX, DEMO_TAKEOFF_PCT_STEP);

    for (int pct = DEMO_TAKEOFF_PCT_STEP;
         pct <= DEMO_TAKEOFF_PCT_MAX && !s_abort;
         pct += DEMO_TAKEOFF_PCT_STEP) {
        set_all_motors_pct(pct);
        ESP_LOGI(TAG, "ramp up: all motors %d%%", pct);
        vTaskDelay(pdMS_TO_TICKS(DEMO_TAKEOFF_DWELL_MS));
    }

    for (int pct = DEMO_TAKEOFF_PCT_MAX - DEMO_TAKEOFF_PCT_STEP;
         pct >= 0 && !s_abort;
         pct -= DEMO_TAKEOFF_PCT_STEP) {
        set_all_motors_pct(pct);
        ESP_LOGI(TAG, "ramp down: all motors %d%%", pct);
        vTaskDelay(pdMS_TO_TICKS(DEMO_TAKEOFF_DWELL_MS));
    }

    motors_stop_all();
    if (s_abort) {
        ESP_LOGI(TAG, "DEMO_TAKEOFF aborted");
    } else {
        ESP_LOGI(TAG, "DEMO_TAKEOFF complete");
    }

    s_running = false;
    s_task = NULL;
    vTaskDelete(NULL);
}

void demo_takeoff_abort(void)
{
    s_abort = true;
    motors_stop_all();
}

void demo_takeoff_start(void)
{
    if (s_running) {
        ESP_LOGW(TAG, "DEMO_TAKEOFF already running");
        return;
    }

    s_abort = false;
    s_running = true;

    BaseType_t ok = xTaskCreate(
        demo_takeoff_task,
        "demo_takeoff",
        3072,
        NULL,
        4,
        &s_task);

    if (ok != pdPASS) {
        ESP_LOGE(TAG, "failed to create demo_takeoff task");
        s_running = false;
        s_task = NULL;
    }
}
