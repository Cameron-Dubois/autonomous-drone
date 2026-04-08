//main.c
//phase 4: sensor fusion + PID + motor mixing
//full flight control loop at 100Hz
//motor API matches drone_ble so the BLE GATT layer can plug in directly

#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "icm42670p.h"
#include "pid.h"
#include "motor.h"

static const char *TAG = "main";

#define RAD_TO_DEG  (180.0f / M_PI)

#define FUSION_INTERVAL_MS  10
#define PRINT_EVERY_N       10

#define ALPHA  0.98f

#define PITCH_P  1.5f
#define PITCH_I  0.0f
#define PITCH_D  0.3f

#define ROLL_P   1.5f
#define ROLL_I   0.0f
#define ROLL_D   0.3f

#define YAW_P    1.0f
#define YAW_I    0.0f
#define YAW_D    0.0f

#define PID_OUTPUT_LIMIT    100.0f
#define PID_INTEGRAL_LIMIT   50.0f

//base throttle for hover testing (0-1023 duty, matching drone_ble scale)
//start at 0 for bench testing — raise once you're ready for powered tests
#define TEST_THROTTLE  0

static int clamp_duty(int val)
{
    if (val < MIN_DUTY) return MIN_DUTY;
    if (val > MAX_DUTY) return MAX_DUTY;
    return val;
}

void app_main(void)
{
    ESP_LOGI(TAG, "=== Phase 4: fusion + PID + motor mixing ===");

    //--- IMU ---
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

    //--- Motors ---
    motors_init();

    //--- PIDs ---
    pid_ctrl_t pid_pitch = {
        .p = PITCH_P, .i = PITCH_I, .d = PITCH_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_ctrl_t pid_roll = {
        .p = ROLL_P, .i = ROLL_I, .d = ROLL_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_ctrl_t pid_yaw = {
        .p = YAW_P, .i = YAW_I, .d = YAW_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_reset(&pid_pitch);
    pid_reset(&pid_roll);
    pid_reset(&pid_yaw);

    //--- Seed angles ---
    float angle_pitch = 0.0f;
    float angle_roll  = 0.0f;

    icm42670p_data_t d;
    ret = icm42670p_read(imu, &d);
    if (ret == ESP_OK) {
        angle_pitch = atan2f(-d.accel_y_g,
                             sqrtf(d.accel_x_g * d.accel_x_g +
                                   d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;
        angle_roll  = atan2f( d.accel_x_g,
                             sqrtf(d.accel_y_g * d.accel_y_g +
                                   d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;
    }

    ESP_LOGI(TAG, "Throttle=%d  Motors OFF (call motor_set_on_off to enable)", TEST_THROTTLE);
    ESP_LOGI(TAG, "Loop running at %d Hz", 1000 / FUSION_INTERVAL_MS);

    int64_t prev_us = esp_timer_get_time();
    int print_counter = 0;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(FUSION_INTERVAL_MS));

        ret = icm42670p_read(imu, &d);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "read error: %s", esp_err_to_name(ret));
            continue;
        }

        int64_t now_us = esp_timer_get_time();
        float dt = (now_us - prev_us) / 1000000.0f;
        prev_us = now_us;

        //--- sensor fusion ---
        float accel_pitch = atan2f(-d.accel_y_g,
                                   sqrtf(d.accel_x_g * d.accel_x_g +
                                         d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;
        float accel_roll  = atan2f( d.accel_x_g,
                                   sqrtf(d.accel_y_g * d.accel_y_g +
                                         d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;

        angle_pitch = ALPHA * (angle_pitch + d.gyro_y_dps * dt) + (1.0f - ALPHA) * accel_pitch;
        angle_roll  = ALPHA * (angle_roll  + d.gyro_x_dps * dt) + (1.0f - ALPHA) * accel_roll;

        //--- PID ---
        float pid_p = pid_compute(&pid_pitch, 0.0f, angle_pitch, dt);
        float pid_r = pid_compute(&pid_roll,  0.0f, angle_roll,  dt);
        float pid_y = pid_compute(&pid_yaw,   0.0f, d.gyro_z_dps, dt);

        //--- X-quad mixing → per-motor duty (0-1023) ---
        //PID range is ±100, scale to ±MAX_DUTY/2 so corrections have
        //enough authority relative to the 0-1023 duty range
        float scale = (float)MAX_DUTY / (2.0f * PID_OUTPUT_LIMIT);
        float p = pid_p * scale;
        float r = pid_r * scale;
        float y = pid_y * scale;

        int m1 = clamp_duty((int)(TEST_THROTTLE + p + r - y));
        int m2 = clamp_duty((int)(TEST_THROTTLE + p - r + y));
        int m3 = clamp_duty((int)(TEST_THROTTLE - p + r + y));
        int m4 = clamp_duty((int)(TEST_THROTTLE - p - r - y));

        motor_set_speed(MOTOR_1, m1);
        motor_set_speed(MOTOR_2, m2);
        motor_set_speed(MOTOR_3, m3);
        motor_set_speed(MOTOR_4, m4);

        if (++print_counter >= PRINT_EVERY_N) {
            print_counter = 0;
            printf("P:%+6.1f R:%+6.1f | PID p:%+6.1f r:%+6.1f y:%+6.1f | M: %4d %4d %4d %4d\n",
                   angle_pitch, angle_roll,
                   pid_p, pid_r, pid_y,
                   m1, m2, m3, m4);
        }
    }
}
