#pragma once

#include "driver/gpio.h"
#include "driver/uart.h"

/* UART: connect GPS TX -> ESP RX, GPS RX -> ESP TX */
#define GPS_UART_NUM        UART_NUM_1
#define GPS_UART_RX_PIN     GPIO_NUM_20
#define GPS_UART_TX_PIN     GPIO_NUM_21
#define GPS_UART_BAUD       115200

/* I2C: ESP32-C3-DevKit-RUST-1 — silkscreen IO10/SDA, IO8/SCL; onboard IMU @0x68, T+H @0x70.
 * Tie GPS module SDA/SCL to the same bus (parallel with headers). Expect QMC5883 @0x0D on GPS. */
#define I2C_PORT_NUM        I2C_NUM_0
#define I2C_SDA_PIN         GPIO_NUM_10
#define I2C_SCL_PIN         GPIO_NUM_8
#define I2C_FREQ_HZ         100000
#define I2C_TIMEOUT_MS      50
