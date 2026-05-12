#pragma once

/**
 * Minimal BMP280/BME280 barometer driver for relative altitude.
 *
 * Wiring (BMP280/BME280 breakout, GY-BMME family):
 *   VCC -> 3V3, GND -> GND, CSB -> 3V3 (selects I2C), SDO -> GND (selects 0x76),
 *   SDA -> shared SDA, SCL -> shared SCL.
 *
 * Shares the I2C master bus owned by compass_mag (see compass_get_i2c_bus).
 * Altitude is reported as metres above the first compensated sample taken
 * after baro_init() (so it shows height change, not true MSL).
 */

#include "driver/i2c_master.h"
#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Probe the BMP280/BME280 at I2C address 0x76 on the supplied bus, read
 * factory calibration, configure normal-mode sampling, and arm the
 * baseline-altitude latch.
 *
 * Returns ESP_OK on success, ESP_ERR_NOT_FOUND when nothing answered at
 * 0x76 or the chip ID didn't match, ESP_FAIL on I2C error.
 */
esp_err_t baro_init(i2c_master_bus_handle_t bus);

/** True once baro_init() succeeded and is still attached. */
bool baro_is_ready(void);

/**
 * Read one fresh sample and update relative altitude.
 * On success, *alt_m_out holds metres above the baseline pressure
 * captured on the first successful read after baro_init().
 * Returns false on I2C error.
 */
bool baro_read_relative_altitude_m(float *alt_m_out);

#ifdef __cplusplus
}
#endif
