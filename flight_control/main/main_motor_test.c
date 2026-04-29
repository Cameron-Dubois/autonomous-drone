//main_motor_test.c
//standalone motor / ESC bring-up. No IMU, no PID, no BLE — just steps each
//motor up to a low test throttle, one at a time, then all four together.
//Use this to confirm:
//   * the ESC is actually receiving the PWM stream we're producing
//   * each motor (M1..M4) physically spins
//   * they spin in the right direction for the X-quad layout
//
//To use this test, swap "main.c" for "main_motor_test.c" in
//flight_control/main/CMakeLists.txt, then `idf.py build flash monitor`.
//
//                          *** SAFETY ***
//   PROPELLERS OFF. Strap the airframe down. The motors WILL spin.
//   Press the BOOT button (GPIO9) at any time to abort and idle every motor.
//
//Each motor runs at TEST_DUTY (default 120 / 1023 ≈ 12 % pulse-width above
//idle, well above any BLHeli/AM32 startup deadband but nowhere near hover).
//Bump TEST_DUTY up gradually as you trust the build more.

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "driver/gpio.h"
#include "motor.h"

static const char *TAG = "motor_test";

// ---- knobs ----------------------------------------------------------------
#define TEST_DUTY            200     // 0..1023 — duty during each spin step
#define SPIN_MS              2000    // how long each motor spins per step
#define PAUSE_MS             1000    // idle gap between steps
#define COUNTDOWN_S          3       // hands-clear delay before motors start

// Set to 1 ONCE to teach the ESC its throttle endpoints (max → min). After the
// first successful run, set back to 0 — the ESC remembers across power cycles.
//
// Calibration sequence (the standard BLHeli_S / AM32 PWM procedure):
//   1.  POWER OFF the ESC (battery unplugged).
//   2.  Plug USB into the ESP32 and let this firmware boot. Motor channels
//       immediately start emitting MAX throttle pulses (2000 µs).
//   3.  POWER ON the ESC (plug battery in) while max throttle is being output.
//       You should hear a "max learned" tone (often two short chirps) within ~2 s.
//   4.  The firmware then drops to MIN throttle (1000 µs). You should hear a
//       "min learned" / save tone (a longer chirp).
//   5.  ESC is now calibrated — set this back to 0, re-flash, and run the
//       normal test. The endpoints persist across power cycles.
//
// *** PROPS OFF for calibration. *** The ESC briefly spins motors up to full
// throttle if step 3's order is wrong (battery in before USB).
#define CALIBRATE_ON_BOOT    0

#define CALIB_HOLD_MAX_MS    5000    // hold 2000 µs while ESC learns max
#define CALIB_HOLD_MIN_MS    5000    // hold 1000 µs while ESC learns min

// active-low BOOT button on the ESP32-C3-DevKit-RUST. Press to abort & idle.
#define ABORT_BUTTON_GPIO    9

// ---------------------------------------------------------------------------
static volatile bool g_aborted = false;

static bool abort_requested(void)
{
    if (gpio_get_level(ABORT_BUTTON_GPIO) == 0) {
        if (!g_aborted) {
            ESP_LOGW(TAG, ">>> ABORT (BOOT pressed) — idling all motors <<<");
            motors_stop_all();
            g_aborted = true;
        }
        return true;
    }
    return false;
}

// Spin one motor at duty for ms, then stop. Returns early if abort is pressed.
static void spin_one(motor_t m, int duty, int ms)
{
    if (g_aborted) return;

    ESP_LOGI(TAG, "Spinning M%d at duty=%d for %d ms", m + 1, duty, ms);
    motor_set_speed(m, duty);
    motor_set_on_off(m, true);

    int elapsed = 0;
    while (elapsed < ms) {
        if (abort_requested()) return;
        vTaskDelay(pdMS_TO_TICKS(20));
        elapsed += 20;
    }

    motor_set_speed(m, 0);
    motor_set_on_off(m, false);
}

static void spin_all(int duty, int ms)
{
    if (g_aborted) return;

    ESP_LOGI(TAG, "Spinning ALL 4 motors together at duty=%d for %d ms", duty, ms);
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_set_speed((motor_t)i, duty);
        motor_set_on_off((motor_t)i, true);
    }

    int elapsed = 0;
    while (elapsed < ms) {
        if (abort_requested()) return;
        vTaskDelay(pdMS_TO_TICKS(20));
        elapsed += 20;
    }

    motors_stop_all();
}

static void idle_gap(int ms)
{
    if (g_aborted) return;

    int elapsed = 0;
    while (elapsed < ms) {
        if (abort_requested()) return;
        vTaskDelay(pdMS_TO_TICKS(20));
        elapsed += 20;
    }
}

#if CALIBRATE_ON_BOOT
// One-shot ESC throttle calibration. See block comment at top of file for the
// physical sequence (battery off → ESP boot → battery on while we hold max).
static void run_esc_calibration(void)
{
    ESP_LOGW(TAG, "*** CALIBRATION MODE *** PROPS OFF.");
    ESP_LOGW(TAG, "1) Make sure the ESC battery is UNPLUGGED.");
    ESP_LOGW(TAG, "2) Holding MAX throttle for %d ms — plug in the battery NOW.",
             CALIB_HOLD_MAX_MS);

    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_set_speed((motor_t)i, MAX_DUTY);   // 2000 µs pulse
        motor_set_on_off((motor_t)i, true);
    }
    idle_gap(CALIB_HOLD_MAX_MS);
    if (g_aborted) return;

    ESP_LOGW(TAG, "3) Dropping to MIN throttle for %d ms — listen for the save tone.",
             CALIB_HOLD_MIN_MS);
    for (int i = 0; i < MOTOR_COUNT; i++)
        motor_set_speed((motor_t)i, 0);          // 1000 µs pulse
    idle_gap(CALIB_HOLD_MIN_MS);
    if (g_aborted) return;

    motors_stop_all();
    ESP_LOGW(TAG, "*** Calibration complete. Set CALIBRATE_ON_BOOT=0, re-flash. ***");

    // Park here so the user can power-cycle without the spin sweep starting.
    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
}
#endif

// ---------------------------------------------------------------------------
void app_main(void)
{
    ESP_LOGW(TAG, "=== Motor / ESC bring-up test ===");
    ESP_LOGW(TAG, "PROPS OFF. Press BOOT button to abort.");

    // BOOT button as active-low input with internal pull-up
    gpio_config_t btn_cfg = {
        .pin_bit_mask = 1ULL << ABORT_BUTTON_GPIO,
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&btn_cfg);

    // ESC PWM up. motors_init() starts driving the idle pulse on every channel,
    // motors_wait_arm_ready() blocks ~3 s so BLHeli/AM32 can detect throttle-low
    // and arm. Without that hold the ESC will beep but ignore the throttle ramp.
    motors_init();

#if CALIBRATE_ON_BOOT
    // Calibration must hold MAX before the ESC powers on, so we skip the
    // arm-ready hold (which forces idle pulse) and jump straight in.
    run_esc_calibration();
    return;
#endif

    motors_wait_arm_ready();

    // Hands-clear countdown — the user has been listening to ESC beeps and may
    // not be ready for motors to actually spin yet.
    for (int s = COUNTDOWN_S; s > 0 && !g_aborted; s--) {
        ESP_LOGW(TAG, "Motors will start in %d ...", s);
        idle_gap(1000);
    }

    int pass = 0;
    while (!g_aborted) {
        pass++;
        ESP_LOGW(TAG, "--- Pass %d : per-motor sweep ---", pass);

        // One motor at a time so you can confirm each ESC channel is alive
        // and which physical motor responds to which firmware index.
        spin_one(MOTOR_1, TEST_DUTY, SPIN_MS);  idle_gap(PAUSE_MS);
        spin_one(MOTOR_2, TEST_DUTY, SPIN_MS);  idle_gap(PAUSE_MS);
        spin_one(MOTOR_3, TEST_DUTY, SPIN_MS);  idle_gap(PAUSE_MS);
        spin_one(MOTOR_4, TEST_DUTY, SPIN_MS);  idle_gap(PAUSE_MS);

        if (g_aborted) break;

        ESP_LOGW(TAG, "--- Pass %d : all-motors test ---", pass);
        spin_all(TEST_DUTY, SPIN_MS);
        idle_gap(PAUSE_MS * 2);
    }

    // Stay alive so the BOOT-press abort message stays on screen.
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
