//main.c
//flight control: sensor fusion + PID + motor mixing with arming safety
//motor API matches drone_ble so the BLE GATT layer can plug in directly

#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "icm42670p.h"
#include "pid.h"
#include "motor.h"

static const char *TAG = "flight";

#define RAD_TO_DEG  (180.0f / M_PI)

#define FUSION_INTERVAL_MS  10
#define PRINT_EVERY_N       10

#define ALPHA  0.98f

#define PITCH_P  1.5f
#define PITCH_I  0.1f
#define PITCH_D  0.2f

#define ROLL_P   1.5f
#define ROLL_I   0.1f
#define ROLL_D   0.2f

#define YAW_P    0.8f
#define YAW_I    0.0f
#define YAW_D    0.0f

#define PID_OUTPUT_LIMIT    100.0f
#define PID_INTEGRAL_LIMIT   50.0f

#define HOVER_THROTTLE   830
#define THROTTLE_RAMP_MS 500

#define ARM_BUTTON_GPIO  9
#define DEBOUNCE_MS      200
#define IMU_FAIL_LIMIT   10

// ---------------------------------------------------------------------------
static bool    g_armed        = false;
static int     g_throttle     = 0;
static int     g_imu_fails    = 0;

static pid_ctrl_t pid_pitch;
static pid_ctrl_t pid_roll;
static pid_ctrl_t pid_yaw;

// ---------------------------------------------------------------------------
static int clamp_duty(int val)
{
    if (val < MIN_DUTY) return MIN_DUTY;
    if (val > MAX_DUTY) return MAX_DUTY;
    return val;
}

static void arm(void)
{
    g_armed    = true;
    g_throttle = 0;
    g_imu_fails = 0;

    pid_reset(&pid_pitch);
    pid_reset(&pid_roll);
    pid_reset(&pid_yaw);

    for (int i = 0; i < MOTOR_COUNT; i++)
        motor_set_on_off((motor_t)i, true);

    ESP_LOGW(TAG, ">>> ARMED — motors enabled, throttle ramping to %d", HOVER_THROTTLE);
}

static void disarm(void)
{
    g_armed    = false;
    g_throttle = 0;
    motors_stop_all();
    ESP_LOGW(TAG, ">>> DISARMED — motors off");
}

// returns true once per button press (falling edge with debounce)
static bool button_pressed(void)
{
    static bool     prev_level   = true;   // pulled up = idle high
    static int64_t  last_press   = 0;

    bool level = gpio_get_level(ARM_BUTTON_GPIO);

    if (!level && prev_level) {
        int64_t now = esp_timer_get_time();
        if ((now - last_press) > (DEBOUNCE_MS * 1000LL)) {
            last_press = now;
            prev_level = level;
            return true;
        }
    }
    prev_level = level;
    return false;
}

// ---------------------------------------------------------------------------
void app_main(void)
{
    ESP_LOGW(TAG, "=== Flight controller — press BOOT button to arm ===");

    // --- arm/disarm button (GPIO9 BOOT, active-low with internal pull-up) ---
    gpio_config_t btn_cfg = {
        .pin_bit_mask = 1ULL << ARM_BUTTON_GPIO,
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&btn_cfg);

    // --- IMU ---
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

    // --- Motors ---
    motors_init();

    // --- PIDs ---
    pid_pitch = (pid_ctrl_t){
        .p = PITCH_P, .i = PITCH_I, .d = PITCH_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_roll = (pid_ctrl_t){
        .p = ROLL_P, .i = ROLL_I, .d = ROLL_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_yaw = (pid_ctrl_t){
        .p = YAW_P, .i = YAW_I, .d = YAW_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
    };
    pid_reset(&pid_pitch);
    pid_reset(&pid_roll);
    pid_reset(&pid_yaw);

    // --- Seed angles from first accel read ---
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

    ESP_LOGW(TAG, "DISARMED — waiting for BOOT button press");
    ESP_LOGI(TAG, "Loop running at %d Hz", 1000 / FUSION_INTERVAL_MS);

    int64_t prev_us = esp_timer_get_time();
    int print_counter = 0;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(FUSION_INTERVAL_MS));

        // --- arm/disarm toggle ---
        if (button_pressed()) {
            if (g_armed)
                disarm();
            else
                arm();
        }

        // --- IMU read with failsafe ---
        ret = icm42670p_read(imu, &d);
        if (ret != ESP_OK) {
            g_imu_fails++;
            if (g_armed && g_imu_fails >= IMU_FAIL_LIMIT) {
                ESP_LOGE(TAG, "IMU failsafe: %d consecutive read failures — disarming", g_imu_fails);
                disarm();
            }
            continue;
        }
        g_imu_fails = 0;

        int64_t now_us = esp_timer_get_time();
        float dt = (now_us - prev_us) / 1000000.0f;
        prev_us = now_us;
        if (dt <= 0.0f || dt > 0.5f) dt = (float)FUSION_INTERVAL_MS / 1000.0f;

        // --- sensor fusion (always runs so angles are ready on arm) ---
        float accel_pitch = atan2f(-d.accel_y_g,
                                   sqrtf(d.accel_x_g * d.accel_x_g +
                                         d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;
        float accel_roll  = atan2f( d.accel_x_g,
                                   sqrtf(d.accel_y_g * d.accel_y_g +
                                         d.accel_z_g * d.accel_z_g)) * RAD_TO_DEG;

        angle_pitch = ALPHA * (angle_pitch + d.gyro_y_dps * dt) + (1.0f - ALPHA) * accel_pitch;
        angle_roll  = ALPHA * (angle_roll  + d.gyro_x_dps * dt) + (1.0f - ALPHA) * accel_roll;

        if (!g_armed) {
            if (++print_counter >= PRINT_EVERY_N * 5) {
                print_counter = 0;
                printf("[DISARMED] P:%+6.1f R:%+6.1f — press BOOT to arm\n",
                       angle_pitch, angle_roll);
            }
            continue;
        }

        // --- throttle ramp ---
        if (g_throttle < HOVER_THROTTLE) {
            int step = (HOVER_THROTTLE * FUSION_INTERVAL_MS) / THROTTLE_RAMP_MS;
            if (step < 1) step = 1;
            g_throttle += step;
            if (g_throttle > HOVER_THROTTLE)
                g_throttle = HOVER_THROTTLE;
        }

        // --- PID ---
        float pid_p = pid_compute(&pid_pitch, 0.0f, angle_pitch, dt);
        float pid_r = pid_compute(&pid_roll,  0.0f, angle_roll,  dt);
        float pid_y = pid_compute(&pid_yaw,   0.0f, d.gyro_z_dps, dt);

        // --- X-quad mixing → per-motor duty (0-1023) ---
        float scale = (float)MAX_DUTY / (2.0f * PID_OUTPUT_LIMIT);
        float p = pid_p * scale;
        float r = pid_r * scale;
        float y = pid_y * scale;

        int m1 = clamp_duty((int)(g_throttle + p + r - y));
        int m2 = clamp_duty((int)(g_throttle + p - r + y));
        int m3 = clamp_duty((int)(g_throttle - p + r + y));
        int m4 = clamp_duty((int)(g_throttle - p - r - y));

        motor_set_speed(MOTOR_1, m1);
        motor_set_speed(MOTOR_2, m2);
        motor_set_speed(MOTOR_3, m3);
        motor_set_speed(MOTOR_4, m4);

        if (++print_counter >= PRINT_EVERY_N) {
            print_counter = 0;
            printf("[ARMED T:%4d] P:%+6.1f R:%+6.1f | PID p:%+6.1f r:%+6.1f y:%+6.1f | M: %4d %4d %4d %4d\n",
                   g_throttle, angle_pitch, angle_roll,
                   pid_p, pid_r, pid_y,
                   m1, m2, m3, m4);
        }
    }
}
