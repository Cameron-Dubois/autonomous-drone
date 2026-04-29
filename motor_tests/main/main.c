#include "motor.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "motor_test";

/* ------------------------------------------------------------------------- *
 *  MODE SELECT
 *
 *  Pick exactly ONE of the modes below by uncommenting it.
 *
 *    MODE_IDENTIFY  - Spins each motor on its own at low throttle so you can
 *                     write down which way each one currently spins.
 *                     RUN WITH PROPS OFF. Put a piece of tape on each bell
 *                     and watch from above (looking down on the drone).
 *
 *    MODE_CONFIGURE - Burns the desired spin direction into each ESC via
 *                     DSHOT cmd 20 (NORMAL) / 21 (REVERSED) + 12 (SAVE).
 *                     Edit the `desired_direction[]` table below FIRST,
 *                     based on what you saw in MODE_IDENTIFY. Run this
 *                     once with PROPS OFF, then power-cycle the drone.
 *                     The setting is persistent in BLHeli.
 *
 *    MODE_RUN       - All four motors at the same throttle (for tether /
 *                     thrust tests). Default mode after direction is set.
 * ------------------------------------------------------------------------- */
#define MODE_IDENTIFY   0
#define MODE_CONFIGURE  1
#define MODE_RUN        2

#define ACTIVE_MODE     MODE_RUN

/* ------------------------------------------------------------------------- *
 *  Physical-to-code motor mapping (verified on this drone):
 *
 *      MOTOR_1 = Back-Left      (GPIO 3)
 *      MOTOR_2 = Front-Left     (GPIO 4)
 *      MOTOR_3 = Back-Right     (GPIO 5)
 *      MOTOR_4 = Front-Right    (GPIO 6)
 *
 *  Spin direction convention for an X-quadcopter (looking down from above,
 *  "props-out"):
 *
 *           FRONT
 *      M2 (CW)    M4 (CCW)
 *               X
 *      M1 (CCW)   M3 (CW)
 *           REAR
 *
 *  Diagonals match: M1 & M4 are CCW, M2 & M3 are CW. With self-tightening
 *  props, motors must spin in the direction the prop's thread expects,
 *  otherwise the prop nut backs off under load (this is exactly why props
 *  flew off at 40%).
 *
 *  IMPORTANT: `false` = NORMAL (DSHOT 20), `true` = REVERSED (DSHOT 21).
 *  That is NOT the same as CW/CCW — it's whatever physical spin each maps to
 *  on your ESC + wiring. Flip one motor's entry and re-CONFIGURE if it's wrong.
 *
 *  How to fill in the table below:
 *    1) Run MODE_IDENTIFY, write down each motor's CURRENT physical direction.
 *    2) For any motor spinning the wrong way for its self-tightening prop,
 *       FLIP its entry (true <-> false) and re-run CONFIGURE.
 *    3) Always power-cycle the drone between CONFIGURE and the next IDENTIFY
 *       pass -- BLHeli only commits the saved direction on the next boot.
 *
 *  Quick flip all four: ESC_DIRECTION_ALL_REVERSED 1 = all REVERSED,
 *  0 = all NORMAL. Then MODE_CONFIGURE, flash, power-cycle.
 * ------------------------------------------------------------------------- */
#define ESC_DIRECTION_ALL_REVERSED  1  /* 1 all REVERSED | 0 all NORMAL */

static const bool desired_reversed[4] = {
#if ESC_DIRECTION_ALL_REVERSED
    true,
    true,
    true,
    true,
#else
    false,
    false,
    false,
    false,
#endif
};

/* Corner label CURRENTLY ASSUMED for each motor index. If IDENTIFY shows
 * a different physical motor moving than the label says, fix the label here
 * (and in motor.h's enum comments). */
static const char *motor_corner(motor_t m)
{
    switch (m) {
        case MOTOR_1: return "Back-Left";
        case MOTOR_2: return "Front-Left";
        case MOTOR_3: return "Back-Right";
        case MOTOR_4: return "Front-Right";
        default:      return "??";
    }
}

static void run_for(int duration_us)
{
    int64_t end = esp_timer_get_time() + duration_us;
    while (esp_timer_get_time() < end)
        motors_tick();
}

/* Spin only one motor at `pct` for `duration_us`, others held at 0. */
static void spin_one(motor_t motor, int pct, int duration_us)
{
    for (int i = 0; i < 4; i++)
        motor_set_throttle((motor_t)i, 0);
    motor_set_throttle(motor, pct);
    run_for(duration_us);
    motor_set_throttle(motor, 0);
}

static void mode_identify(void)
{
    ESP_LOGW(TAG, "MODE_IDENTIFY: PROPS OFF. Spinning each motor at 5%% for 3 s.");
    ESP_LOGW(TAG, "For each motor: write down (a) which physical CORNER moves,");
    ESP_LOGW(TAG, "and (b) which direction (CW or CCW from above) it spins.");

    for (int i = 0; i < 4; i++) {
        int gpio = motor_get_gpio(i);
        ESP_LOGI(TAG, ">>> MOTOR_%d on GPIO %d   (assumed corner: %s)",
                 i + 1, gpio, motor_corner((motor_t)i));
        spin_one((motor_t)i, 5, 3000000);
        ESP_LOGI(TAG, "<<< MOTOR_%d on GPIO %d stopped. Pause 2 s.", i + 1, gpio);
        run_for(2000000);
    }
    motors_stop_all();
    ESP_LOGI(TAG, "Identify pass complete. Restart in 3 s...");
    run_for(3000000);
}

static void mode_configure(void)
{
    ESP_LOGW(TAG, "MODE_CONFIGURE: PROPS OFF. Burning spin direction into each ESC.");
    for (int i = 0; i < 4; i++) {
        ESP_LOGI(TAG, "MOTOR_%d (GPIO %d, %s) -> %s",
                 i + 1, motor_get_gpio(i), motor_corner((motor_t)i),
                 desired_reversed[i] ? "REVERSED" : "NORMAL");
        motor_set_direction((motor_t)i, desired_reversed[i]);
    }
    motors_stop_all();
    ESP_LOGW(TAG, "Done. POWER-CYCLE the drone before flying. Idling here.");
    while (1) {
        motors_tick();
    }
}

static void mode_run(void)
{
    const int pct_step = 10;
    const int pct_max  = 40;
    const int dwell_us = 2000000;

    while (1) {
        for (int pct = pct_step; pct <= pct_max; pct += pct_step) {
            for (int i = 0; i < 4; i++)
                motor_set_throttle((motor_t)i, pct);
            ESP_LOGI(TAG, "All motors at %d%% (ramp up)", pct);
            run_for(dwell_us);
        }

        for (int pct = pct_max - pct_step; pct >= pct_step; pct -= pct_step) {
            for (int i = 0; i < 4; i++)
                motor_set_throttle((motor_t)i, pct);
            ESP_LOGI(TAG, "All motors at %d%% (ramp down)", pct);
            run_for(dwell_us);
        }

        motors_stop_all();
        ESP_LOGI(TAG, "All motors at 0%%");
        run_for(dwell_us);

        ESP_LOGI(TAG, "Restart...");
        run_for(2000000);
    }
}

void app_main(void)
{
    motors_init();

#if ACTIVE_MODE == MODE_IDENTIFY
    while (1) mode_identify();
#elif ACTIVE_MODE == MODE_CONFIGURE
    mode_configure();
#elif ACTIVE_MODE == MODE_RUN
    mode_run();
#else
#error "ACTIVE_MODE must be MODE_IDENTIFY, MODE_CONFIGURE, or MODE_RUN"
#endif
}
