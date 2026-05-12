//main_motor_test.c
//standalone motor / ESC bring-up. No IMU, no PID, no BLE — just steps each
//motor up to a low test throttle, one at a time, then all four together.
//Uses the same DSHOT300 stack as motor_tests/main/motor.c.
//Use this to confirm:
//   * the ESC is actually receiving the DSHOT stream we're producing
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
//Each motor runs at TEST_DUTY (default 200 / 1023) mapped into the DSHOT
//throttle range — equivalent spirit to motor_tests MODE_RUN percentages.

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

    // DSHOT arm burst + pump task in motors_init(); extra idle in motors_wait_arm_ready().
    motors_init();

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
