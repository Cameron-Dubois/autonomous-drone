//main.c
//flight control: sensor fusion + PID + motor mixing with arming safety
//motor API matches drone_ble so the BLE GATT layer can plug in directly
//
// ---------------------------------------------------------------------------
//  TETHERED BRING-UP CHECKLIST  (do these in order before untethered flight)
// ---------------------------------------------------------------------------
//  Step 1: PWM motor sanity check
//      - Confirm flight_control/main/CMakeLists.txt builds main_motor_test.c.
//      - Flash, hear ESC arm tones, verify each M1..M4 spins and turns the
//        direction you saved in BLHeli via DSHOT cmd 21 (motor_tests project).
//
//  Step 2: IMU sanity check
//      - Swap CMakeLists to main_imu_test.c, flash, watch the gyro/accel
//        stream. With the drone still, gyros sit near 0 dps; accel reads
//        ~1 g on whichever axis is "down". Gentle tilt should respond.
//
//  Step 3: MIX VERIFICATION  (PROPS OFF, drone held in hand)
//      - Build this file (main.c) with TETHER_BRINGUP_MODE = 1 below so the
//        max commanded throttle stays low (~25%, no real lift even if the
//        mix is wrong).
//      - ARM via BOOT button. All four motors should spin at equal low duty.
//      - Tilt nose UP (front edge rises). Back motors (M1=BL, M3=BR) should
//        SPEED UP; front motors (M2=FL, M4=FR) should SLOW DOWN.
//      - Tilt right wing DOWN. Left motors (M1=BL, M2=FL) should SPEED UP;
//        right motors (M3=BR, M4=FR) should SLOW DOWN.
//      - Yaw the airframe CW (looking down from above). CCW props (M1, M4)
//        should SPEED UP; CW props (M2, M3) should SLOW DOWN.
//      - If any axis goes the WRONG way, FLIP the sign of that term in the
//        per-motor mix at the bottom of this file. Do not skip this step.
//
//  Step 4: Tethered low-throttle test  (PROPS ON; tether short and slack)
//      - Still TETHER_BRINGUP_MODE = 1. Drone should produce thrust without
//        lifting; the PID loop should resist hand-induced tilt.
//      - Watch the serial log for runaway / oscillation. Disarm immediately
//        with BOOT button if anything misbehaves.
//
//  Step 5: Tethered hover attempt
//      - Set TETHER_BRINGUP_MODE = 0 to use the real HOVER_THROTTLE. The
//        drone should now produce enough thrust to take weight off the
//        tether. Tune PITCH/ROLL gains here, not in step 4.
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <math.h>
#include <stdatomic.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "icm42670p.h"
#include "pid.h"
#include "motor.h"
#include "ble_command.h"

static const char *TAG = "flight";

#define RAD_TO_DEG  (180.0f / M_PI)

#define FUSION_INTERVAL_MS  10
#define PRINT_EVERY_N       10

#define ALPHA  0.98f

// P+I on fused angle; D uses gyro (pid_compute_angle).
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

// Set to 1 for steps 3 and 4 of the bring-up checklist above. Caps the
// commanded throttle to TETHER_MAX_DUTY (well below true hover) and ramps
// in slowly so a wrong-sign mix produces obvious-but-survivable behavior
// instead of an instant tether yank.
#define TETHER_BRINGUP_MODE  1

#if TETHER_BRINGUP_MODE
#define HOVER_THROTTLE     250    // ~24 % — produces airflow but no lift
#define THROTTLE_RAMP_MS  2000    // 2 s ramp so the operator can react
#else
#define HOVER_THROTTLE     830    // ~81 % — actual hover for the 600 g frame
#define THROTTLE_RAMP_MS   500
#endif

#define ARM_BUTTON_GPIO  9
#define DEBOUNCE_MS      200
#define IMU_FAIL_LIMIT   10

// ---------------------------------------------------------------------------
static bool    g_armed        = false;
static int     g_throttle     = 0;
static int     g_imu_fails    = 0;

// BLE thread runs separately from this loop; it sets one of these request
// flags atomically and the main loop services them in a deterministic order
// (ESTOP > DISARM > ARM > SET_MOTOR). Direct calls into arm()/disarm() or
// motor_set_speed() from the BLE callbacks would race the PID/throttle state
// mutated below.
static atomic_bool g_req_arm    = ATOMIC_VAR_INIT(false);
static atomic_bool g_req_disarm = ATOMIC_VAR_INIT(false);
static atomic_bool g_req_estop  = ATOMIC_VAR_INIT(false);

// Per-motor SET_MOTOR requests from the app. -1 = no pending request,
// 0..255 = pending throttle (mobile-app units, scaled to MAX_DUTY on apply).
// Used in BENCH TEST mode (drone disarmed) to spin individual motors on
// command from the mobile app's per-motor screens. Ignored while armed —
// the PID + mixer owns motor outputs in flight.
static atomic_int g_req_set_motor[4] = {
    ATOMIC_VAR_INIT(-1), ATOMIC_VAR_INIT(-1),
    ATOMIC_VAR_INIT(-1), ATOMIC_VAR_INIT(-1),
};

// True while at least one motor is being driven by SET_MOTOR (bench mode).
// Cleared by disarm()/ESTOP/watchdog. Lets the link-loss watchdog fire
// during bench testing too, not just during armed flight.
static bool g_bench_active = false;

// Last time any command was received from the mobile app.
// Used as a link-loss failsafe: if we're armed (or bench-active) and nothing
// has come in for LINK_TIMEOUT_MS, we disarm and stop all motors.
static atomic_int_fast64_t g_last_link_us = ATOMIC_VAR_INIT(0);
#define LINK_TIMEOUT_MS  1500

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
    g_armed        = false;
    g_throttle     = 0;
    g_bench_active = false;
    /* Drop any pending bench commands so a stale SET_MOTOR doesn't spin a
     * motor back up immediately after disarm. */
    for (int i = 0; i < 4; i++) atomic_store(&g_req_set_motor[i], -1);
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

// ---- BLE callbacks (run in NimBLE host task — keep them tiny) ------------
static void ble_on_arm(void)
{
    atomic_store(&g_req_arm, true);
    atomic_store(&g_last_link_us, esp_timer_get_time());
}
static void ble_on_disarm(void)
{
    atomic_store(&g_req_disarm, true);
    atomic_store(&g_last_link_us, esp_timer_get_time());
}
static void ble_on_estop(void)
{
    /* ESTOP must always win — set both estop and disarm so the consumer
     * can't get stuck even if estop is somehow ignored. */
    atomic_store(&g_req_estop, true);
    atomic_store(&g_req_disarm, true);
    atomic_store(&g_last_link_us, esp_timer_get_time());
}
static void ble_on_heartbeat(void)
{
    atomic_store(&g_last_link_us, esp_timer_get_time());
}
static void ble_on_set_motor(int motor_index, uint8_t throttle)
{
    if (motor_index < 0 || motor_index > 3) return;
    /* Store as 0..255; main loop atomic_exchange consumes and converts. */
    atomic_store(&g_req_set_motor[motor_index], (int)throttle);
    atomic_store(&g_last_link_us, esp_timer_get_time());
}

// ---------------------------------------------------------------------------
void app_main(void)
{
    ESP_LOGW(TAG, "=== Flight controller — BLE ARM/DISARM/ESTOP + BOOT button backup ===");

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
    // motors_init() configures LEDC and starts driving the idle pulse on every
    // ESC channel. motors_wait_arm_ready() then blocks for ~3 s while the ESCs
    // observe that idle pulse and run their internal arming sequence — without
    // this hold, BLHeli_S/_32/AM32 ESCs will beep at boot but silently refuse
    // to spin the motor when throttle commands arrive later.
    motors_init();
    motors_wait_arm_ready();

    // --- BLE command server ---
    // Brings up NimBLE, advertises as "DroneBLE", and routes ARM / DISARM /
    // ESTOP / HEARTBEAT into the request flags above. Mobile app already
    // speaks this protocol against the drone_ble firmware — no app changes.
    ble_command_callbacks_t cbs = {
        .on_arm        = ble_on_arm,
        .on_disarm     = ble_on_disarm,
        .on_estop      = ble_on_estop,
        .on_heartbeat  = ble_on_heartbeat,
        .on_set_motor  = ble_on_set_motor,
    };
    esp_err_t ble_ret = ble_command_init(&cbs);
    if (ble_ret != ESP_OK) {
        ESP_LOGE(TAG, "BLE init failed (%s) — BOOT button arming still works",
                 esp_err_to_name(ble_ret));
    }

    // --- PIDs ---
    pid_pitch = (pid_ctrl_t){
        .p = PITCH_P, .i = PITCH_I, .d = PITCH_D,
        .integral_limit = PID_ANGLE_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
    };
    pid_roll = (pid_ctrl_t){
        .p = ROLL_P, .i = ROLL_I, .d = ROLL_D,
        .integral_limit = PID_ANGLE_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
    };
    pid_yaw = (pid_ctrl_t){
        .p = YAW_P, .i = YAW_I, .d = YAW_D,
        .integral_limit = PID_INTEGRAL_LIMIT,
        .output_limit   = PID_OUTPUT_LIMIT,
        .d_filter_tau   = PID_D_FILTER_TAU_S,
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

        // --- BLE command service (priority order: ESTOP > DISARM > ARM) ---
        // ESTOP and DISARM are checked unconditionally; ARM only when not
        // already armed, so a stuck mobile-app retry can't re-arm a drone
        // that operator deliberately disarmed via BOOT button.
        if (atomic_exchange(&g_req_estop, false)) {
            ESP_LOGE(TAG, "BLE ESTOP — disarming");
            disarm();
            atomic_store(&g_req_arm,    false);  // cancel any pending arm
            atomic_store(&g_req_disarm, false);
        }
        if (atomic_exchange(&g_req_disarm, false)) {
            if (g_armed) disarm();
        }
        if (atomic_exchange(&g_req_arm, false)) {
            if (!g_armed) arm();
        }

        // --- Per-motor SET_MOTOR requests (bench test mode only) ---
        // While armed for flight, SET_MOTOR is ignored: the PID/mixer below
        // owns motor outputs and a manual override would just be overwritten
        // on the next tick (and would fight stabilisation if it weren't).
        for (int i = 0; i < 4; i++) {
            int v = atomic_exchange(&g_req_set_motor[i], -1);
            if (v < 0) continue;
            if (g_armed) {
                ESP_LOGW(TAG, "SET_MOTOR_%d ignored — armed for flight (PID owns motors)",
                         i + 1);
                continue;
            }
            /* Mobile-app throttle is 0..255; motor driver is 0..MAX_DUTY. */
            int duty = (v * MAX_DUTY) / 255;
            motor_set_on_off((motor_t)i, duty > 0);
            motor_set_speed((motor_t)i, duty);
            if (duty > 0) g_bench_active = true;
            ESP_LOGI(TAG, "BENCH M%d -> throttle=%u duty=%d", i + 1, v, duty);
        }

        // --- BOOT button (backup arming + manual abort) ---
        // If anything is spinning (armed flight OR bench-test), BOOT is a
        // panic stop. Otherwise it's the backup ARM in case BLE is dead.
        if (button_pressed()) {
            if (g_armed || g_bench_active) {
                ESP_LOGW(TAG, "BOOT button — stopping all motors");
                disarm();
            } else {
                arm();
            }
        }

        // --- BLE link-loss failsafe (covers armed flight AND bench test) ---
        if (g_armed || g_bench_active) {
            int64_t last = atomic_load(&g_last_link_us);
            int64_t age_ms = (esp_timer_get_time() - last) / 1000;
            if (last != 0 && age_ms > LINK_TIMEOUT_MS) {
                ESP_LOGE(TAG, "BLE link silent for %lld ms — stopping all motors", age_ms);
                disarm();
            }
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

        // --- PID (pitch/roll D from gyro; yaw still rate PID on gyro_z) ---
        float pid_p = pid_compute_angle(&pid_pitch, 0.0f, angle_pitch, d.gyro_y_dps, dt);
        float pid_r = pid_compute_angle(&pid_roll,  0.0f, angle_roll,  d.gyro_x_dps, dt);
        float pid_y = pid_compute(&pid_yaw,   0.0f, d.gyro_z_dps, dt);

        // --- X-quad mixing → per-motor duty (0-1023) ---
        //
        // Corner map (verified, see motor.h):
        //   M1 = Back-Left   (CCW)   M2 = Front-Left  (CW)
        //   M3 = Back-Right  (CW)    M4 = Front-Right (CCW)
        //
        // Sign expectations the tilt test in step 3 of the checklist
        // (top of file) verifies:
        //   +pitch correction (nose came up → push it down) → BACK gets MORE
        //   +roll  correction (right wing came down → push it up) → LEFT gets MORE
        //   +yaw   correction (nose came right → push it left)    → CW props (M2,M3) get MORE
        //
        // If a tilt test shows wrong direction on any axis, flip the sign
        // of that letter on those two motors. Don't change the mix without
        // the bench tilt test confirming the fix.
        float scale = (float)MAX_DUTY / (2.0f * PID_OUTPUT_LIMIT);
        float p = pid_p * scale;
        float r = pid_r * scale;
        float y = pid_y * scale;

        int m1 = clamp_duty((int)(g_throttle + p + r - y));  // BL  (CCW)
        int m2 = clamp_duty((int)(g_throttle + p - r + y));  // FL  (CW)
        int m3 = clamp_duty((int)(g_throttle - p + r + y));  // BR  (CW)
        int m4 = clamp_duty((int)(g_throttle - p - r - y));  // FR  (CCW)

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
