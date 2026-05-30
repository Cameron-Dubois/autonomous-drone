/*
 * app_main.c - boot orchestration only.  All real work lives in
 * components/ (imu, motors, wifi_link, flight_task, ...).
 *
 * Order matters:
 *   1. Motors first, disarmed, so a glitchy boot can't spin a prop.
 *   2. IMU next: abort and let the watchdog reboot on failure.
 *   3. WiFi last: bringing the link up before the IMU would mean a
 *      pilot could send packets while the controller is uninitialized.
 *   4. Flight task spawn -- it owns everything from here.
 */
#include "esp_err.h"
#include "esp_log.h"

#include "flight_task.h"
#include "imu.h"
#include "motors.h"
#include "wifi_link.h"

static const char *TAG = "boot";

void app_main(void)
{
    ESP_LOGI(TAG, "esp32c3-drone starting");

    ESP_ERROR_CHECK(motors_init());
    motors_arm(false);                       /* belt-and-suspenders */

    ESP_ERROR_CHECK(imu_init());
    ESP_ERROR_CHECK(wifi_link_init());

    ESP_ERROR_CHECK(flight_task_start());

    ESP_LOGI(TAG, "boot complete -- waiting for ground station");
}
