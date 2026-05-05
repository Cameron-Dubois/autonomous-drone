//motor.c
//brushless ESC driver — generates servo-style PWM (1.0–2.0 ms pulse) on 4 GPIOs.
//Tested target: Aero Selfie 4IN1-ESC-LDO 45A (PWM/DShot/OneShot capable).
//
//Per the Aero Selfie datasheet:
//    Initialization range: 1000 – 1050 µs   (ESC armed, motor idle)
//    Start signal range:   1050 – 2000 µs   (motor spinning, throttle proportional)
//
//We pick the idle pulse at 1040 µs (middle of the init band) instead of an
//edge value like 1000 µs. Reason: LEDC has a finite step size and at 50 Hz
//13-bit a "1000 µs" duty actually outputs ~998.7 µs, which is *below* the
//ESC's init range and trips its "no throttle signal" beep-every-3-s detector.
//Setting CONFIG_ESC_PULSE_MIN_US=1040 keeps us safely inside 1000–1050 µs
//regardless of frequency.
//
//Why 490 Hz (default) instead of 50 Hz:
//  Modern FPV ESCs (BLHeli_S, BLHeli_32, AM32) auto-detect the input protocol
//  by sampling the pulse stream. 490 Hz is what Betaflight / iNav use as the
//  default PWM rate and works on essentially every BLHeli/AM32 ESC in the FPV
//  stack. 50 Hz also works in principle but gives the ESC fewer samples per
//  second and amplifies LEDC quantization error.
//
//Why we hold idle pulse at boot:
//  Brushless ESCs will not run the motor until they have observed a steady
//  idle pulse for a couple seconds — this is how they distinguish "controller
//  booted, throttle low" from "garbage input, refuse to arm". motors_init()
//  drives the GPIO with the idle pulse, and motors_wait_arm_ready() blocks
//  long enough (3 s) for the ESC to register it.
//
//API: duty 0..1023 → pulse min..max µs. duty=0 = idle (motor off / armed-low).

#include "motor.h"
#include "driver/ledc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_err.h"
#include "esp_log.h"

static const char *TAG = "motor";

static const int motor_pwm_gpios[MOTOR_COUNT] = {
    CONFIG_MOTOR_1_PWM_GPIO,
    CONFIG_MOTOR_2_PWM_GPIO,
    CONFIG_MOTOR_3_PWM_GPIO,
    CONFIG_MOTOR_4_PWM_GPIO,
};

static const ledc_channel_t ledc_channels[MOTOR_COUNT] = {
    LEDC_CHANNEL_0,
    LEDC_CHANNEL_1,
    LEDC_CHANNEL_2,
    LEDC_CHANNEL_3,
};

#define LEDC_MODE          LEDC_LOW_SPEED_MODE
#define LEDC_TIMER_NUM     LEDC_TIMER_0

/* Pulled from Kconfig (Motor Configuration menu). Defaults are conservative
 * for FPV BLHeli/AM32 ESCs: 490 Hz + 1000–2000 µs pulses. */
#define ESC_PWM_FREQ_HZ    CONFIG_ESC_PWM_FREQ_HZ
#define ESC_PULSE_MIN_US   CONFIG_ESC_PULSE_MIN_US
#define ESC_PULSE_MAX_US   CONFIG_ESC_PULSE_MAX_US

/* 13-bit duty resolution. At 490 Hz that's ~4 ticks/µs across the active
 * 1–2 ms portion of each frame — finer than any ESC can resolve. */
#define ESC_DUTY_RES       LEDC_TIMER_13_BIT
#define LEDC_MAX_DUTY_RAW  ((1 << 13) - 1)

#define LEDC_PERIOD_US     (1000000u / ESC_PWM_FREQ_HZ)

/* How long motors_wait_arm_ready() blocks on the idle pulse before returning.
 * BLHeli_S/_32 typically need ~2 s to detect "throttle low" and arm; the
 * extra second is margin for slow capacitor charge / firmware variation. */
#define ESC_ARM_HOLD_MS    3000

static int  motor_duty[MOTOR_COUNT] = {0, 0, 0, 0};
static bool motor_on[MOTOR_COUNT]   = {false, false, false, false};

/* µs pulse → raw LEDC duty count, clamped to the active period. */
static uint32_t pulse_us_to_ledc_duty(uint32_t pulse_us)
{
    if (pulse_us > LEDC_PERIOD_US)
        pulse_us = LEDC_PERIOD_US;
    return (uint32_t)(((uint64_t)pulse_us * LEDC_MAX_DUTY_RAW) / LEDC_PERIOD_US);
}

/* Map firmware throttle 0..1023 → pulse length; 0 = idle pulse. */
static uint32_t throttle_to_pulse_us(int duty_throttle)
{
    if (duty_throttle < MIN_DUTY)
        duty_throttle = MIN_DUTY;
    if (duty_throttle > MAX_DUTY)
        duty_throttle = MAX_DUTY;
    return ESC_PULSE_MIN_US
        + (uint32_t)(((int64_t)duty_throttle * (ESC_PULSE_MAX_US - ESC_PULSE_MIN_US)) / MAX_DUTY);
}

static void motor_apply_duty(motor_t motor)
{
    int thr = motor_on[motor] ? motor_duty[motor] : 0;
    uint32_t pulse_us  = throttle_to_pulse_us(thr);
    uint32_t ledc_duty = pulse_us_to_ledc_duty(pulse_us);

    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, ledc_channels[motor], ledc_duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, ledc_channels[motor]));

    ESP_LOGD(TAG, "M%u thr=%d pulse_us=%u ledc=%u",
             (unsigned)(motor + 1), thr, (unsigned)pulse_us, (unsigned)ledc_duty);
}

void motors_init(void)
{
    ESP_LOGI(TAG, "Initializing brushless ESC outputs (%u Hz PWM, %u-%u µs)...",
             (unsigned)ESC_PWM_FREQ_HZ,
             (unsigned)ESC_PULSE_MIN_US,
             (unsigned)ESC_PULSE_MAX_US);

    ledc_timer_config_t timer_conf = {
        .speed_mode      = LEDC_MODE,
        .timer_num       = LEDC_TIMER_NUM,
        .duty_resolution = ESC_DUTY_RES,
        .freq_hz         = ESC_PWM_FREQ_HZ,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));

    /* All channels start outputting the idle pulse immediately so the ESC sees
     * a clean 1000 µs reference from the moment the GPIO comes up. */
    uint32_t idle_ledc = pulse_us_to_ledc_duty(ESC_PULSE_MIN_US);

    for (int i = 0; i < MOTOR_COUNT; i++) {
        ledc_channel_config_t channel_conf = {
            .speed_mode = LEDC_MODE,
            .channel    = ledc_channels[i],
            .timer_sel  = LEDC_TIMER_NUM,
            .intr_type  = LEDC_INTR_DISABLE,
            .gpio_num   = motor_pwm_gpios[i],
            .duty       = idle_ledc,
            .hpoint     = 0,
        };
        ESP_ERROR_CHECK(ledc_channel_config(&channel_conf));
    }

    ESP_LOGI(TAG, "ESC signals: M1=GPIO%d  M2=GPIO%d  M3=GPIO%d  M4=GPIO%d",
             motor_pwm_gpios[0], motor_pwm_gpios[1],
             motor_pwm_gpios[2], motor_pwm_gpios[3]);
    ESP_LOGI(TAG, "Idle pulse %u µs (LEDC duty %u / %u). Throttle range %d..%d.",
             (unsigned)ESC_PULSE_MIN_US, (unsigned)idle_ledc,
             (unsigned)LEDC_MAX_DUTY_RAW, MIN_DUTY, MAX_DUTY);
}

void motors_wait_arm_ready(void)
{
    /* Make sure the LEDC channels really are sitting at idle pulse before we
     * start counting — guards against the caller having already poked the
     * channels with a non-zero duty for some reason. */
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_on[i]   = false;
        motor_duty[i] = 0;
        motor_apply_duty((motor_t)i);
    }

    ESP_LOGI(TAG, "Holding idle pulse for %d ms so the ESC can arm...", ESC_ARM_HOLD_MS);
    vTaskDelay(pdMS_TO_TICKS(ESC_ARM_HOLD_MS));
    ESP_LOGI(TAG, "ESC arm hold complete — motors ready for throttle commands.");
}

void motor_increase_speed(motor_t motor, int amount)
{
    motor_duty[motor] += amount;
    if (motor_duty[motor] > MAX_DUTY)
        motor_duty[motor] = MAX_DUTY;
    motor_apply_duty(motor);
}

void motor_decrease_speed(motor_t motor, int amount)
{
    motor_duty[motor] -= amount;
    if (motor_duty[motor] < MIN_DUTY)
        motor_duty[motor] = MIN_DUTY;
    motor_apply_duty(motor);
}

void motor_set_speed(motor_t motor, int duty)
{
    if (duty > MAX_DUTY)
        duty = MAX_DUTY;
    if (duty < MIN_DUTY)
        duty = MIN_DUTY;
    motor_duty[motor] = duty;
    motor_apply_duty(motor);
}

void motor_set_on_off(motor_t motor, bool on)
{
    motor_on[motor] = on;
    ESP_LOGI(TAG, "Motor %d %s", motor + 1, on ? "ON" : "OFF");
    motor_apply_duty(motor);
}

void motor_set_direction(motor_t motor, bool forward)
{
    (void)motor;
    (void)forward;
    /* Brushless rotation direction is set by ESC wiring (swap any two phase
     * leads) or by the BLHeli/AM32 motor-direction setting — no GPIO. */
}

void motors_stop_all(void)
{
    ESP_LOGI(TAG, "Stopping all motors (ESC idle pulse)");
    for (int i = 0; i < MOTOR_COUNT; i++) {
        motor_on[i]   = false;
        motor_duty[i] = 0;
        motor_apply_duty((motor_t)i);
    }
}
