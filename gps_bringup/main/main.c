#include "board_config.h"
#include "compass_mag.h"
#include "gps_nmea.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "gps_bringup";

static void sensor_task(void *arg)
{
    (void)arg;
    TickType_t last_log = xTaskGetTickCount();
    uint32_t prev_rx_total = 0;

    while (1) {
        gps_uart_poll();

        TickType_t now = xTaskGetTickCount();
        if ((now - last_log) >= pdMS_TO_TICKS(1000)) {
            gps_fix_t fix;
            gps_get_fix(&fix);

            gps_stats_t st;
            gps_get_stats(&st);
            uint32_t rx_per_sec = st.rx_bytes_total - prev_rx_total;
            prev_rx_total = st.rx_bytes_total;

            float heading = 0.0f;
            bool compass_ok = compass_read_heading_deg(&heading);

            const char *ctype = "NONE";
            switch (compass_get_type()) {
                case COMPASS_TYPE_QMC5883: ctype = "QMC5883"; break;
                case COMPASS_TYPE_HMC5883L: ctype = "HMC5883L"; break;
                default: break;
            }

            ESP_LOGI(TAG,
                     "GPS valid=%d fix=%d sats=%d hdop=%.1f lat=%.6f lon=%.6f | uart_rx_B/s=%lu gga_cnt=%lu | compass=%s %s heading=%.1f deg",
                     fix.valid, fix.fix_quality, fix.satellites, fix.hdop,
                     fix.lat_deg, fix.lon_deg,
                     (unsigned long)rx_per_sec, (unsigned long)st.gga_parsed_count,
                     ctype, compass_ok ? "OK" : "WAIT", heading);
            last_log = now;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Stage A: GPS + compass bring-up");
    gps_uart_init();

    esp_err_t cerr = compass_init();
    if (cerr != ESP_OK) {
        ESP_LOGW(TAG, "Compass init failed (%s) — GPS-only; check SDA/SCL and module I2C address",
                 esp_err_to_name(cerr));
    }

    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
}
