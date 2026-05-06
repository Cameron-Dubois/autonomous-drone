#pragma once

#include "esp_err.h"
#include <stdbool.h>
#include <stdint.h>

typedef enum {
    COMPASS_TYPE_NONE = 0,
    COMPASS_TYPE_QMC5883,
    COMPASS_TYPE_HMC5883L,
} compass_type_t;

/** Install I2C, log bus scan, detect QMC5883 (0x0D) or HMC5883L (0x1E). */
esp_err_t compass_init(void);

compass_type_t compass_get_type(void);

/**
 * Read heading in degrees [0, 360), smoothed and declination-adjusted.
 * Uses runtime hard-iron correction after calibration window has non-zero span.
 * @return true if a new sample was ready / read succeeded
 */
bool compass_read_heading_deg(float *heading_deg_out);

typedef struct {
    int16_t x_raw;
    int16_t y_raw;
    int16_t x_min;
    int16_t x_max;
    int16_t y_min;
    int16_t y_max;
    float heading_raw_deg;
    float heading_cal_deg;
    bool calibrated;
} compass_debug_t;

/**
 * Return latest raw XY and simple hard-iron corrected heading.
 * Calibrated heading is only valid after moving through a wide range of headings.
 */
bool compass_get_debug(compass_debug_t *out);

/** Clear runtime min/max calibration window and restart debug tracking. */
void compass_reset_calibration(void);
