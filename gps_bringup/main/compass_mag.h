#pragma once

#include "esp_err.h"
#include <stdbool.h>

typedef enum {
    COMPASS_TYPE_NONE = 0,
    COMPASS_TYPE_QMC5883,
    COMPASS_TYPE_HMC5883L,
} compass_type_t;

/** Install I2C, log bus scan, detect QMC5883 (0x0D) or HMC5883L (0x1E). */
esp_err_t compass_init(void);

compass_type_t compass_get_type(void);

/**
 * Read heading in degrees [0, 360), magnetic (uncalibrated).
 * @return true if a new sample was ready / read succeeded
 */
bool compass_read_heading_deg(float *heading_deg_out);
