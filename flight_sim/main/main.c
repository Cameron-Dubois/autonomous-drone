//main.c
//Hardware-in-the-loop testing with Python quadcopter simulator
//runs the SAME fusion + PID + mixer logic as flight_control
//but reads simulated sensor data from USB serial and sends motor commands back

#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "pid.h"
#include "hil_link.h"

static const char *TAG = "hil";

#define RAD_TO_DEG  (180.0f / M_PI)

#define ALPHA  0.98f

//--- identical PID gains to flight_control/main.c ---
// Tuned for the 600 g brushless airframe (Iyy ~1.3e-3, motor τ ~8 ms): lower
// loop gain than the original 60 g micro values so the controller stays in
// its linear regime instead of getting pulled into a saturation-driven
// pitch limit cycle by stacked phase lag (motor lag + D filter + sample
// hold + serial transport). The gyro filter (d_filter_tau) and conditional
// integration in pid.c keep this safe against gyro noise.
#define PITCH_P  0.70f
#define PITCH_I  0.012f
#define PITCH_D  0.18f

#define ROLL_P   0.70f
#define ROLL_I   0.012f
#define ROLL_D   0.18f

// Yaw is rate-mode (setpoint = 0 dps); P-only is fine. Smaller gain keeps the
// mixer from saturating pitch/roll motors when yaw demands kick in.
#define YAW_P    0.30f
#define YAW_I    0.0f
#define YAW_D    0.0f

#define PID_OUTPUT_LIMIT         100.0f
#define PID_INTEGRAL_LIMIT        50.0f
#define PID_ANGLE_INTEGRAL_LIMIT   8.0f

// First-order LPF time constant on the rate signal that feeds the D term.
// 0.005 s ≈ 32 Hz cutoff — high enough that it doesn't add meaningful phase
// lag at the body's natural frequency (~3 Hz), but low enough to suppress
// motor / vibration band spikes.
#define PID_D_FILTER_TAU_S  0.005f

#define FUSION_INTERVAL_MS  10

#define MAX_DUTY  1023
#define HOVER_THROTTLE    830
#define THROTTLE_RAMP_MS  500
#define WARMUP_CYCLES     20

static int clamp_duty(int val)
{
    if (val < 0)        return 0;
    if (val > MAX_DUTY) return MAX_DUTY;
    return val;
}

void app_main(void)
{
    ESP_LOGW(TAG, "=== HIL simulation mode ===");
    ESP_LOGW(TAG, "Waiting for bridge on USB serial...");

    esp_err_t ret = hil_link_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "HIL link init failed: %s", esp_err_to_name(ret));
        return;
    }

    esp_log_level_set("*", ESP_LOG_NONE);

    pid_ctrl_t pid_pitch = {
        .p = PITCH_P, .i = PITCH_I, .d = PITCH_D,
        .integral_limit = PID_ANGLE_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
    };
    pid_ctrl_t pid_roll = {
        .p = ROLL_P, .i = ROLL_I, .d = ROLL_D,
        .integral_limit = PID_ANGLE_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
    };
    pid_ctrl_t pid_yaw = {
        .p = YAW_P, .i = YAW_I, .d = YAW_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
    };
    pid_reset(&pid_pitch);
    pid_reset(&pid_roll);
    pid_reset(&pid_yaw);

    float angle_pitch = 0.0f;
    float angle_roll  = 0.0f;
    bool  filter_seeded = false;
    int   warmup_count  = 0;
    int   throttle      = 0;
    int   consecutive_timeouts = 0;

    int64_t prev_us = esp_timer_get_time();

    while (1) {
        hil_sensor_pkt_t sensor;
        ret = hil_receive_sensors(&sensor, 100);
        if (ret != ESP_OK) {
            consecutive_timeouts++;
            if (consecutive_timeouts >= 3) {
                filter_seeded = false;
                warmup_count  = 0;
                throttle      = 0;
                pid_reset(&pid_pitch);
                pid_reset(&pid_roll);
                pid_reset(&pid_yaw);
            }
            continue;
        }
        consecutive_timeouts = 0;

        int64_t now_us = esp_timer_get_time();
        float dt = (now_us - prev_us) / 1000000.0f;
        prev_us = now_us;
        if (dt <= 0.0f || dt > 0.5f) dt = (float)FUSION_INTERVAL_MS / 1000.0f;

        //--- sensor fusion (identical to flight_control) ---
        float accel_pitch = atan2f(-sensor.accel_y_g,
                                   sqrtf(sensor.accel_x_g * sensor.accel_x_g +
                                         sensor.accel_z_g * sensor.accel_z_g)) * RAD_TO_DEG;
        float accel_roll  = atan2f( sensor.accel_x_g,
                                   sqrtf(sensor.accel_y_g * sensor.accel_y_g +
                                         sensor.accel_z_g * sensor.accel_z_g)) * RAD_TO_DEG;

        if (!filter_seeded) {
            angle_pitch = accel_pitch;
            angle_roll  = accel_roll;
            filter_seeded = true;
        }

        angle_pitch = ALPHA * (angle_pitch + sensor.gyro_y_dps * dt) + (1.0f - ALPHA) * accel_pitch;
        angle_roll  = ALPHA * (angle_roll  + sensor.gyro_x_dps * dt) + (1.0f - ALPHA) * accel_roll;

        //--- warmup: let filter converge before enabling PID ---
        if (warmup_count < WARMUP_CYCLES) {
            warmup_count++;
            hil_motor_pkt_t motor_pkt = {
                .duty = { 0, 0, 0, 0 },
                .pitch_deg = angle_pitch,
                .roll_deg  = angle_roll,
            };
            hil_send_motors(&motor_pkt);
            pid_reset(&pid_pitch);
            pid_reset(&pid_roll);
            pid_reset(&pid_yaw);
            continue;
        }

        //--- throttle ramp (identical to flight_control) ---
        if (throttle < HOVER_THROTTLE) {
            int step = (HOVER_THROTTLE * FUSION_INTERVAL_MS) / THROTTLE_RAMP_MS;
            if (step < 1) step = 1;
            throttle += step;
            if (throttle > HOVER_THROTTLE)
                throttle = HOVER_THROTTLE;
        }

        //--- PID (pitch/roll D from gyro; same as flight_control) ---
        float pid_p = pid_compute_angle(&pid_pitch, 0.0f, angle_pitch, sensor.gyro_y_dps, dt);
        float pid_r = pid_compute_angle(&pid_roll,  0.0f, angle_roll,  sensor.gyro_x_dps, dt);
        float pid_y = pid_compute(&pid_yaw,   0.0f, sensor.gyro_z_dps, dt);

        //--- X-quad mixing (identical to flight_control) ---
        float scale = (float)MAX_DUTY / (2.0f * PID_OUTPUT_LIMIT);
        float p = pid_p * scale;
        float r = pid_r * scale;
        float y = pid_y * scale;

        int m1 = clamp_duty((int)(throttle + p + r - y));
        int m2 = clamp_duty((int)(throttle + p - r + y));
        int m3 = clamp_duty((int)(throttle - p + r + y));
        int m4 = clamp_duty((int)(throttle - p - r - y));

        hil_motor_pkt_t motor_pkt = {
            .duty = { (uint16_t)m1, (uint16_t)m2, (uint16_t)m3, (uint16_t)m4 },
            .pitch_deg = angle_pitch,
            .roll_deg  = angle_roll,
        };
        hil_send_motors(&motor_pkt);
    }
}
