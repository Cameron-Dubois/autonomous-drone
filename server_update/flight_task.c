#include "flight_task.h"

#include <math.h>
#include <string.h>

#include "esp_log.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "app_config.h"
#include "attitude.h"
#include "imu.h"
#include "mixer.h"
#include "motors.h"
#include "pid.h"
#include "wifi_link.h"

static const char *TAG = "flight";

static pid_t s_pid_roll_rate;
static pid_t s_pid_pitch_rate;
static pid_t s_pid_yaw_rate;
static pid_t s_pid_roll_angle;     /* P-only outer loop */
static pid_t s_pid_pitch_angle;

static void init_pids(void)
{
    pid_init(&s_pid_roll_rate,  PID_ROLL_RATE_KP,  PID_ROLL_RATE_KI,  PID_ROLL_RATE_KD, 0.5f, 1.0f);
    pid_init(&s_pid_pitch_rate, PID_PITCH_RATE_KP, PID_PITCH_RATE_KI, PID_PITCH_RATE_KD, 0.5f, 1.0f);
    pid_init(&s_pid_yaw_rate,   PID_YAW_RATE_KP,   PID_YAW_RATE_KI,   PID_YAW_RATE_KD,   0.5f, 1.0f);

    pid_init(&s_pid_roll_angle,  PID_ROLL_ANGLE_KP,  0.0f, 0.0f, 0.0f, MAX_RATE_DPS);
    pid_init(&s_pid_pitch_angle, PID_PITCH_ANGLE_KP, 0.0f, 0.0f, 0.0f, MAX_RATE_DPS);
}

static void task_main(void *arg)
{
    (void)arg;

    esp_task_wdt_add(NULL);

    init_pids();
    attitude_reset();

    imu_calibrate_gyro_bias();

    TickType_t next_wake = xTaskGetTickCount();
    int64_t prev_us = esp_timer_get_time();
    int telemetry_div = 0;

    for (;;) {
        /* ---- 1. Pace the loop ----------------------------------- */
        vTaskDelayUntil(&next_wake, pdMS_TO_TICKS(1000 / LOOP_HZ));
        int64_t now_us = esp_timer_get_time();
        uint32_t loop_us = (uint32_t)(now_us - prev_us);
        prev_us = now_us;
        float dt = (float)loop_us * 1e-6f;
        if (dt <= 0.0f || dt > 0.05f) dt = LOOP_DT_S;  /* sanity clamp */

        /* ---- 2. Read IMU & update attitude ---------------------- */
        imu_sample_t s;
        if (imu_read(&s) != ESP_OK) {
            /* IMU dropped a beat -- failsafe and keep trying. */
            motors_arm(false);
            esp_task_wdt_reset();
            continue;
        }
        attitude_t att;
        attitude_update(&s, dt, &att);

        /* ---- 3. Read latest control input + failsafe ------------ */
        ctrl_input_t in;
        wifi_link_get_latest(&in);
        bool link_ok = wifi_link_is_alive();
        bool armed   = link_ok && in.armed && in.throttle >= 0.0f;
        motors_arm(armed);

        if (!armed) {
            pid_reset(&s_pid_roll_rate);
            pid_reset(&s_pid_pitch_rate);
            pid_reset(&s_pid_yaw_rate);
            motors_set_all(0.0f, 0.0f, 0.0f, 0.0f);
            esp_task_wdt_reset();
            continue;
        }

        /* ---- 4. Outer angle loop -> rate setpoints -------------- */
        float roll_sp_deg  = in.roll  * MAX_TILT_DEG;
        float pitch_sp_deg = in.pitch * MAX_TILT_DEG;
        float yaw_rate_sp  = in.yaw   * MAX_YAW_RATE_DPS;

        float roll_rate_sp  = pid_step(&s_pid_roll_angle,  roll_sp_deg,  att.roll,  dt);
        float pitch_rate_sp = pid_step(&s_pid_pitch_angle, pitch_sp_deg, att.pitch, dt);

        /* ---- 5. Inner rate loop --------------------------------- */
        float roll_cmd  = pid_step(&s_pid_roll_rate,  roll_rate_sp,  s.gx, dt);
        float pitch_cmd = pid_step(&s_pid_pitch_rate, pitch_rate_sp, s.gy, dt);
        float yaw_cmd   = pid_step(&s_pid_yaw_rate,   yaw_rate_sp,   s.gz, dt);

        /* ---- 6. Mix and write motors ---------------------------- */
        float m[4];
        mixer_compute(in.throttle, roll_cmd, pitch_cmd, yaw_cmd, m);
        motors_set_all(m[0], m[1], m[2], m[3]);

        /* ---- 7. Telemetry (50 Hz) and watchdog ------------------ */
        if (++telemetry_div >= LOOP_HZ / 50) {
            telemetry_div = 0;
            wifi_link_send_telemetry(att.roll, att.pitch, att.yaw,
                                     in.throttle, armed, loop_us);
        }

        if (loop_us > (uint32_t)(LOOP_PERIOD_US * 1.5)) {
            ESP_LOGW(TAG, "loop overrun: %lu us", (unsigned long)loop_us);
        }

        esp_task_wdt_reset();
    }
}

esp_err_t flight_task_start(void)
{
    BaseType_t ok = xTaskCreate(task_main, "flight",
                                4096, NULL, 22, NULL);
    if (ok != pdPASS) {
        ESP_LOGE(TAG, "couldn't create flight task");
        return ESP_FAIL;
    }
    return ESP_OK;
}
