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

/* Compass output tuning */
#define COMPASS_DECLINATION_DEG      13.2f  /* Santa Cruz area magnetic declination (approx) */
#define COMPASS_HEADING_OFFSET_DEG   0.0f   /* Add after declination if board +X/+Y vs drone nose differs */
#define COMPASS_EMA_ALPHA            0.20f  /* 0..1, lower is smoother */
/* Reject single-sample I2C spikes vs previous accepted point. Must be larger than real motion
 * between reads during a calibration spin (full ellipse span is often ~500–1500 LSB/axis). */
#define COMPASS_MAG_MAX_STEP_ABS     2800

/* Use hard-iron corrected heading only when both axes span at least this (matches cal_q PARTIAL). */
#define COMPASS_MIN_CAL_SPAN_FOR_HEADING 120
