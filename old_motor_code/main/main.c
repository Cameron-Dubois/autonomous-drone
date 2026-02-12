#include "driver/ledc.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_err.h"

// Motor 1
#define MOTOR1_PWM_GPIO 4  // IN1
#define MOTOR1_DIR_GPIO 3  // IN2

// Motor 2
#define MOTOR2_PWM_GPIO 1  // IN3
#define MOTOR2_DIR_GPIO 0  // IN4

// PWM config
#define LEDC_MODE LEDC_LOW_SPEED_MODE
#define LEDC_TIMER LEDC_TIMER_0
#define LEDC_DUTY_RES LEDC_TIMER_13_BIT
#define LEDC_FREQUENCY 4000

#define MAX_DUTY 8191
#define MIN_DUTY 0

int motor1_duty = 4096; // 50%
int motor2_duty = 4096; // 50%

void init_direction_pins(void) {
    gpio_config_t dir_conf = {
        .pin_bit_mask = (1ULL << MOTOR1_DIR_GPIO) | (1ULL << MOTOR2_DIR_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_down_en = 0,
        .pull_up_en = 0,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&dir_conf);

    gpio_set_level(MOTOR1_DIR_GPIO, 0); // forward
    gpio_set_level(MOTOR2_DIR_GPIO, 0);
}

void init_pwm_channels(void) {
    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz = LEDC_FREQUENCY,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));

    // Motor 1
    ledc_channel_config_t m1 = {
        .speed_mode = LEDC_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER,
        .intr_type = LEDC_INTR_DISABLE,
        .gpio_num = MOTOR1_PWM_GPIO,
        .duty = motor1_duty,
        .hpoint = 0
    };
    ESP_ERROR_CHECK(ledc_channel_config(&m1));

    // Motor 2
    ledc_channel_config_t m2 = {
        .speed_mode = LEDC_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER,
        .intr_type = LEDC_INTR_DISABLE,
        .gpio_num = MOTOR2_PWM_GPIO,
        .duty = motor2_duty,
        .hpoint = 0
    };
    ESP_ERROR_CHECK(ledc_channel_config(&m2));

    // Apply initial duty
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, LEDC_CHANNEL_0, motor1_duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, LEDC_CHANNEL_0));
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, LEDC_CHANNEL_1, motor2_duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, LEDC_CHANNEL_1));
}

void update_motor_duty(int motor, int delta) {
    int *duty = (motor == 1) ? &motor1_duty : &motor2_duty;
    *duty += delta;
    if (*duty > MAX_DUTY) *duty = MAX_DUTY;
    if (*duty < MIN_DUTY) *duty = MIN_DUTY;

    ledc_channel_t ch = (motor == 1) ? LEDC_CHANNEL_0 : LEDC_CHANNEL_1;
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_MODE, ch, *duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_MODE, ch));
}

void app_main(void) {
    // UART0 for input
    const uart_port_t uart_num = UART_NUM_0;
    uart_config_t uart_config = {
        .baud_rate = 115200,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    uart_param_config(uart_num, &uart_config);
    uart_driver_install(uart_num, 256, 0, 0, NULL, 0);

    init_direction_pins();
    init_pwm_channels();

    uint8_t data[1];
    while (1) {
        int len = uart_read_bytes(uart_num, data, 1, pdMS_TO_TICKS(100));
        if (len > 0) {
            char c = data[0];
            if (c == 'w') update_motor_duty(1, 500);
            if (c == 's') update_motor_duty(1, -500);
            if (c == 'i') update_motor_duty(2, 500);
            if (c == 'k') update_motor_duty(2, -500);
        }
        vTaskDelay(pdMS_TO_TICKS(10)); // yields to watchdog
    }
}
