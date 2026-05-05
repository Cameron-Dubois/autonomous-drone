//main_imu_test.c
//phase 1: initialize the ICM-42670-P and print sensor data over serial
//tilt the board and watch the numbers change to verify it works
//
//to use this test, replace "main.c" with "main_imu_test.c" in CMakeLists.txt

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "icm42670p.h"

static const char *TAG = "main";

#define PRINT_INTERVAL_MS  100

void app_main(void)
{
    ESP_LOGI(TAG, "=== ICM-42670-P  Phase-1 bring-up ===");

    icm42670p_handle_t imu = NULL;

    esp_err_t ret = icm42670p_init(
        GYRO_FS_2000DPS | GYRO_ODR_100HZ,
        ACCEL_FS_16G    | ACCEL_ODR_100HZ,
        &imu
    );

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "IMU init failed (%s). Check wiring: SDA=GPIO%d  SCL=GPIO%d",
                 esp_err_to_name(ret),
                 CONFIG_IMU_I2C_SDA_GPIO,
                 CONFIG_IMU_I2C_SCL_GPIO);
        return;
    }

    ESP_LOGI(TAG, "IMU ready - printing data at %d Hz", 1000 / PRINT_INTERVAL_MS);
    ESP_LOGI(TAG, "Columns: ax(g)  ay(g)  az(g)  gx(dps)  gy(dps)  gz(dps)  temp(C)");

    icm42670p_data_t d;

    while (1) {
        ret = icm42670p_read(imu, &d);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "read error: %s", esp_err_to_name(ret));
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
        }

        printf("A: x%+7.3f y%+7.3f z%+7.3f  G: x%+8.2f y%+8.2f z%+8.2f  T: %.1f C\n",
               d.accel_x_g,  d.accel_y_g,  d.accel_z_g,
               d.gyro_x_dps, d.gyro_y_dps, d.gyro_z_dps,
               d.temp_c);

        vTaskDelay(pdMS_TO_TICKS(PRINT_INTERVAL_MS));
    }
}
