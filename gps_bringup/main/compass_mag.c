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

/* i2c_master_* xfer_timeout_ms is in milliseconds (not FreeRTOS ticks). */
#define I2C_XFER_TIMEOUT_MS  I2C_TIMEOUT_MS

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
    float heading = atan2f((float)y, (float)x) * (180.0f / (float)M_PI);
    if (heading < 0.0f) {
        heading += 360.0f;
    }
    *heading_deg_out = heading;
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
    float heading = atan2f((float)y, (float)x) * (180.0f / (float)M_PI);
    if (heading < 0.0f) {
        heading += 360.0f;
    }
    *heading_deg_out = heading;
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
