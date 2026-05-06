#include "compass_mag.h"
#include "board_config.h"

#include "driver/i2c_master.h"
#include "esp_log.h"

#include <math.h>

static const char *TAG = "compass";

#define QMC_ADDR            0x0D
#define QMC_REG_X_LSB       0x00
#define QMC_REG_STATUS      0x06
#define QMC_REG_CTRL1       0x09

#define HMC_ADDR            0x1E
#define HMC_REG_IDENT_A     0x0A
#define HMC_REG_CFG_A       0x00
#define HMC_REG_CFG_B       0x01
#define HMC_REG_MODE        0x02
#define HMC_REG_DATA_X_MSB  0x03

static compass_type_t s_type = COMPASS_TYPE_NONE;
static i2c_master_bus_handle_t s_i2c_bus = NULL;
static i2c_master_dev_handle_t s_mag_dev = NULL;
static bool s_debug_have_sample = false;
static bool s_debug_have_prev = false;
static int16_t s_x_raw = 0;
static int16_t s_y_raw = 0;
static int16_t s_x_min = 0;
static int16_t s_x_max = 0;
static int16_t s_y_min = 0;
static int16_t s_y_max = 0;
static float s_heading_raw_deg = 0.0f;
static float s_heading_cal_deg = 0.0f;
static int16_t s_prev_x_raw = 0;
static int16_t s_prev_y_raw = 0;

/* Reject clearly implausible single-sample jumps (typically I2C glitch/outlier). */
#define MAG_MAX_STEP_ABS 600

/* i2c_master_* xfer_timeout_ms is in milliseconds (not FreeRTOS ticks). */
#define I2C_XFER_TIMEOUT_MS  I2C_TIMEOUT_MS

/* Tuneable heading output behavior. */
#ifndef COMPASS_DECLINATION_DEG
#define COMPASS_DECLINATION_DEG 0.0f
#endif

#ifndef COMPASS_EMA_ALPHA
#define COMPASS_EMA_ALPHA 0.25f
#endif

static bool s_heading_filtered_valid = false;
static float s_heading_filtered_deg = 0.0f;

static void mag_dev_release(void)
{
    if (s_mag_dev) {
        i2c_master_bus_rm_device(s_mag_dev);
        s_mag_dev = NULL;
    }
}

static esp_err_t mag_write_reg(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t value)
{
    uint8_t buf[2] = {reg, value};
    return i2c_master_transmit(dev, buf, sizeof(buf), I2C_XFER_TIMEOUT_MS);
}

static esp_err_t mag_read_regs(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t *out, size_t len)
{
    return i2c_master_transmit_receive(dev, &reg, 1, out, len, I2C_XFER_TIMEOUT_MS);
}

static float heading_from_xy(int16_t x, int16_t y)
{
    float heading = atan2f((float)y, (float)x) * (180.0f / (float)M_PI);
    if (heading < 0.0f) {
        heading += 360.0f;
    }
    return heading;
}

static float normalize_heading_deg(float deg)
{
    while (deg >= 360.0f) {
        deg -= 360.0f;
    }
    while (deg < 0.0f) {
        deg += 360.0f;
    }
    return deg;
}

static float wrap_delta_deg(float target_deg, float current_deg)
{
    float delta = target_deg - current_deg;
    if (delta > 180.0f) {
        delta -= 360.0f;
    } else if (delta < -180.0f) {
        delta += 360.0f;
    }
    return delta;
}

/**
 * Hard-iron min/max is meaningless until the board has been rotated enough; before that,
 * calibrated heading can swing wildly even when raw is stable. Only blend to cal once span
 * reaches COMPASS_MIN_CAL_SPAN_FOR_HEADING on both axes (same idea as cal_q PARTIAL).
 */
static float heading_base_for_output(void)
{
    if (!s_debug_have_sample) {
        return s_heading_raw_deg;
    }
    int dx = (int)s_x_max - (int)s_x_min;
    int dy = (int)s_y_max - (int)s_y_min;
    if (dx <= 0 || dy <= 0) {
        return s_heading_raw_deg;
    }
    if (dx >= COMPASS_MIN_CAL_SPAN_FOR_HEADING && dy >= COMPASS_MIN_CAL_SPAN_FOR_HEADING) {
        return s_heading_cal_deg;
    }
    return s_heading_raw_deg;
}

void compass_reset_calibration(void)
{
    s_debug_have_sample = false;
    s_debug_have_prev = false;
    s_x_raw = s_y_raw = 0;
    s_x_min = s_x_max = 0;
    s_y_min = s_y_max = 0;
    s_heading_raw_deg = 0.0f;
    s_heading_cal_deg = 0.0f;
    s_prev_x_raw = s_prev_y_raw = 0;
    s_heading_filtered_valid = false;
    s_heading_filtered_deg = 0.0f;
    ESP_LOGI(TAG, "Calibration window reset");
}

static void update_debug_xy(int16_t x, int16_t y)
{
    if (s_debug_have_prev) {
        int dx_step = (int)x - (int)s_prev_x_raw;
        int dy_step = (int)y - (int)s_prev_y_raw;
        if (dx_step < 0) dx_step = -dx_step;
        if (dy_step < 0) dy_step = -dy_step;
        if (dx_step > MAG_MAX_STEP_ABS || dy_step > MAG_MAX_STEP_ABS) {
            ESP_LOGW(TAG,
                     "Ignoring compass outlier sample x=%d y=%d (step dx=%d dy=%d)",
                     (int)x, (int)y, dx_step, dy_step);
            return;
        }
    }

    s_prev_x_raw = x;
    s_prev_y_raw = y;
    s_debug_have_prev = true;

    s_x_raw = x;
    s_y_raw = y;
    s_heading_raw_deg = heading_from_xy(x, y);

    if (!s_debug_have_sample) {
        s_x_min = s_x_max = x;
        s_y_min = s_y_max = y;
        s_debug_have_sample = true;
    } else {
        if (x < s_x_min) s_x_min = x;
        if (x > s_x_max) s_x_max = x;
        if (y < s_y_min) s_y_min = y;
        if (y > s_y_max) s_y_max = y;
    }

    int32_t x_off = ((int32_t)s_x_min + (int32_t)s_x_max) / 2;
    int32_t y_off = ((int32_t)s_y_min + (int32_t)s_y_max) / 2;
    int16_t x_cal = (int16_t)((int32_t)x - x_off);
    int16_t y_cal = (int16_t)((int32_t)y - y_off);
    s_heading_cal_deg = heading_from_xy(x_cal, y_cal);
}

static void i2c_bus_scan(void)
{
    ESP_LOGI(TAG, "I2C scan port=%d SDA=%d SCL=%d ...", (int)I2C_PORT_NUM,
             (int)I2C_SDA_PIN, (int)I2C_SCL_PIN);
    int found = 0;
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        if (i2c_master_probe(s_i2c_bus, addr, I2C_XFER_TIMEOUT_MS) == ESP_OK) {
            ESP_LOGI(TAG, "  probe OK: 0x%02X", addr);
            found++;
        }
    }
    ESP_LOGI(TAG, "I2C scan done, devices=%d", found);
}

static esp_err_t mag_dev_add(uint8_t addr7)
{
    mag_dev_release();
    const i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr7,
        .scl_speed_hz = I2C_FREQ_HZ,
    };
    return i2c_master_bus_add_device(s_i2c_bus, &dev_cfg, &s_mag_dev);
}

static esp_err_t try_init_qmc(void)
{
    if (i2c_master_probe(s_i2c_bus, QMC_ADDR, I2C_XFER_TIMEOUT_MS) != ESP_OK) {
        return ESP_ERR_NOT_FOUND;
    }
    esp_err_t err = mag_dev_add(QMC_ADDR);
    if (err != ESP_OK) {
        return err;
    }

    uint8_t st = 0;
    err = mag_read_regs(s_mag_dev, QMC_REG_STATUS, &st, 1);
    if (err != ESP_OK) {
        mag_dev_release();
        return ESP_ERR_NOT_FOUND;
    }

    err = mag_write_reg(s_mag_dev, QMC_REG_CTRL1, 0x1D);
    if (err != ESP_OK) {
        mag_dev_release();
        return ESP_FAIL;
    }

    s_type = COMPASS_TYPE_QMC5883;
    ESP_LOGI(TAG, "Using QMC5883 @ 0x%02X", QMC_ADDR);
    return ESP_OK;
}

static esp_err_t try_init_hmc(void)
{
    if (i2c_master_probe(s_i2c_bus, HMC_ADDR, I2C_XFER_TIMEOUT_MS) != ESP_OK) {
        return ESP_ERR_NOT_FOUND;
    }
    esp_err_t err = mag_dev_add(HMC_ADDR);
    if (err != ESP_OK) {
        return err;
    }

    uint8_t id = 0;
    err = mag_read_regs(s_mag_dev, HMC_REG_IDENT_A, &id, 1);
    if (err != ESP_OK || id != 0x48) {
        mag_dev_release();
        return ESP_ERR_NOT_FOUND;
    }

    err = mag_write_reg(s_mag_dev, HMC_REG_CFG_A, 0x70);
    if (err != ESP_OK) {
        mag_dev_release();
        return ESP_FAIL;
    }
    err = mag_write_reg(s_mag_dev, HMC_REG_CFG_B, 0x20);
    if (err != ESP_OK) {
        mag_dev_release();
        return ESP_FAIL;
    }
    err = mag_write_reg(s_mag_dev, HMC_REG_MODE, 0x00);
    if (err != ESP_OK) {
        mag_dev_release();
        return ESP_FAIL;
    }

    s_type = COMPASS_TYPE_HMC5883L;
    ESP_LOGI(TAG, "Using HMC5883L @ 0x%02X (ID_A=0x%02X)", HMC_ADDR, id);
    return ESP_OK;
}

esp_err_t compass_init(void)
{
    const i2c_master_bus_config_t bus_cfg = {
        .i2c_port = I2C_PORT_NUM,
        .sda_io_num = I2C_SDA_PIN,
        .scl_io_num = I2C_SCL_PIN,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .intr_priority = 0,
        .trans_queue_depth = 0,
        .flags = {
            .enable_internal_pullup = true,
        },
    };

    esp_err_t err = i2c_new_master_bus(&bus_cfg, &s_i2c_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_new_master_bus: %s", esp_err_to_name(err));
        return err;
    }

    i2c_bus_scan();

    compass_reset_calibration();

    if (try_init_qmc() == ESP_OK) {
        return ESP_OK;
    }
    if (try_init_hmc() == ESP_OK) {
        return ESP_OK;
    }

    ESP_LOGW(TAG, "No supported magnetometer found (tried QMC 0x%02X, HMC 0x%02X)",
             QMC_ADDR, HMC_ADDR);
    s_type = COMPASS_TYPE_NONE;
    mag_dev_release();
    return ESP_ERR_NOT_FOUND;
}

compass_type_t compass_get_type(void)
{
    return s_type;
}

static bool read_qmc(float *heading_deg_out)
{
    uint8_t status = 0;
    if (mag_read_regs(s_mag_dev, QMC_REG_STATUS, &status, 1) != ESP_OK) {
        return false;
    }
    if ((status & 0x01) == 0) {
        return false;
    }
    uint8_t raw[6];
    if (mag_read_regs(s_mag_dev, QMC_REG_X_LSB, raw, sizeof(raw)) != ESP_OK) {
        return false;
    }
    int16_t x = (int16_t)((raw[1] << 8) | raw[0]);
    int16_t y = (int16_t)((raw[3] << 8) | raw[2]);
    update_debug_xy(x, y);
    float heading_base = heading_base_for_output();

    float heading_decl = normalize_heading_deg(heading_base + COMPASS_DECLINATION_DEG);

    if (!s_heading_filtered_valid) {
        s_heading_filtered_deg = heading_decl;
        s_heading_filtered_valid = true;
    } else {
        float delta = wrap_delta_deg(heading_decl, s_heading_filtered_deg);
        s_heading_filtered_deg = normalize_heading_deg(s_heading_filtered_deg + (COMPASS_EMA_ALPHA * delta));
    }

    *heading_deg_out = s_heading_filtered_deg;
    return true;
}

static bool read_hmc(float *heading_deg_out)
{
    uint8_t raw[6];
    if (mag_read_regs(s_mag_dev, HMC_REG_DATA_X_MSB, raw, sizeof(raw)) != ESP_OK) {
        return false;
    }
    int16_t x = (int16_t)((raw[0] << 8) | raw[1]);
    int16_t z = (int16_t)((raw[2] << 8) | raw[3]);
    (void)z;
    int16_t y = (int16_t)((raw[4] << 8) | raw[5]);
    update_debug_xy(x, y);
    float heading_base = heading_base_for_output();

    float heading_decl = normalize_heading_deg(heading_base + COMPASS_DECLINATION_DEG);

    if (!s_heading_filtered_valid) {
        s_heading_filtered_deg = heading_decl;
        s_heading_filtered_valid = true;
    } else {
        float delta = wrap_delta_deg(heading_decl, s_heading_filtered_deg);
        s_heading_filtered_deg = normalize_heading_deg(s_heading_filtered_deg + (COMPASS_EMA_ALPHA * delta));
    }

    *heading_deg_out = s_heading_filtered_deg;
    return true;
}

bool compass_read_heading_deg(float *heading_deg_out)
{
    if (!heading_deg_out || !s_mag_dev) {
        return false;
    }
    switch (s_type) {
        case COMPASS_TYPE_QMC5883:
            return read_qmc(heading_deg_out);
        case COMPASS_TYPE_HMC5883L:
            return read_hmc(heading_deg_out);
        default:
            return false;
    }
}

bool compass_get_debug(compass_debug_t *out)
{
    if (!out || !s_debug_have_sample) {
        return false;
    }
    out->x_raw = s_x_raw;
    out->y_raw = s_y_raw;
    out->x_min = s_x_min;
    out->x_max = s_x_max;
    out->y_min = s_y_min;
    out->y_max = s_y_max;
    out->heading_raw_deg = s_heading_raw_deg;
    out->heading_cal_deg = s_heading_cal_deg;
    out->calibrated = (s_x_max > s_x_min) && (s_y_max > s_y_min);
    return true;
}
