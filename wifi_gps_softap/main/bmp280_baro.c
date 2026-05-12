/**
 * BMP280 / BME280 barometric pressure driver, used to derive a
 * relative altitude that the mobile app displays beside drone GPS.
 *
 * Compensation math is the Bosch reference integer implementation from the
 * BMP280 datasheet (rev 1.19, Annex A) — left verbatim aside from variable
 * naming so it stays auditable against the datasheet.
 */

#include "bmp280_baro.h"

#include "esp_log.h"

#include <math.h>
#include <string.h>

static const char *TAG = "baro";

#define BARO_I2C_ADDR        0x76
#define BARO_I2C_FREQ_HZ     100000
#define BARO_XFER_TIMEOUT_MS 50

#define BMP280_REG_CALIB0    0x88
#define BMP280_REG_ID        0xD0
#define BMP280_REG_RESET     0xE0
#define BMP280_REG_CTRL_MEAS 0xF4
#define BMP280_REG_CONFIG    0xF5
#define BMP280_REG_PRESS_MSB 0xF7

#define BMP280_CHIP_ID       0x58
#define BME280_CHIP_ID       0x60

/* ctrl_meas: osrs_t=x2 (010), osrs_p=x16 (101), mode=normal (11) -> 0x57. */
#define BMP280_CTRL_MEAS     ((0x2u << 5) | (0x5u << 2) | 0x3u)
/* config: t_sb=0.5ms (000), filter=x16 (100), spi3w=0 -> 0x10. */
#define BMP280_CONFIG        ((0x0u << 5) | (0x4u << 2))

/* Standard atmosphere lapse exponent for h = 44330 * (1 - (p/p0)^(1/5.255)). */
#define BARO_LAPSE_EXP       (1.0 / 5.255)
#define BARO_ALT_SCALE_M     44330.0

typedef struct {
    uint16_t dig_T1;
    int16_t  dig_T2;
    int16_t  dig_T3;
    uint16_t dig_P1;
    int16_t  dig_P2;
    int16_t  dig_P3;
    int16_t  dig_P4;
    int16_t  dig_P5;
    int16_t  dig_P6;
    int16_t  dig_P7;
    int16_t  dig_P8;
    int16_t  dig_P9;
} baro_calib_t;

static i2c_master_dev_handle_t s_dev = NULL;
static baro_calib_t s_calib;
static int32_t s_t_fine = 0;
static bool s_baseline_valid = false;
static double s_baseline_pa = 0.0;

static esp_err_t baro_write_reg(uint8_t reg, uint8_t value)
{
    const uint8_t buf[2] = {reg, value};
    return i2c_master_transmit(s_dev, buf, sizeof(buf), BARO_XFER_TIMEOUT_MS);
}

static esp_err_t baro_read_regs(uint8_t reg, uint8_t *out, size_t len)
{
    return i2c_master_transmit_receive(s_dev, &reg, 1, out, len, BARO_XFER_TIMEOUT_MS);
}

static void release_dev(void)
{
    if (s_dev) {
        i2c_master_bus_rm_device(s_dev);
        s_dev = NULL;
    }
}

static esp_err_t read_calibration(void)
{
    uint8_t raw[24];
    esp_err_t err = baro_read_regs(BMP280_REG_CALIB0, raw, sizeof(raw));
    if (err != ESP_OK) {
        return err;
    }
    s_calib.dig_T1 = (uint16_t)(raw[0]  | (raw[1]  << 8));
    s_calib.dig_T2 = (int16_t) (raw[2]  | (raw[3]  << 8));
    s_calib.dig_T3 = (int16_t) (raw[4]  | (raw[5]  << 8));
    s_calib.dig_P1 = (uint16_t)(raw[6]  | (raw[7]  << 8));
    s_calib.dig_P2 = (int16_t) (raw[8]  | (raw[9]  << 8));
    s_calib.dig_P3 = (int16_t) (raw[10] | (raw[11] << 8));
    s_calib.dig_P4 = (int16_t) (raw[12] | (raw[13] << 8));
    s_calib.dig_P5 = (int16_t) (raw[14] | (raw[15] << 8));
    s_calib.dig_P6 = (int16_t) (raw[16] | (raw[17] << 8));
    s_calib.dig_P7 = (int16_t) (raw[18] | (raw[19] << 8));
    s_calib.dig_P8 = (int16_t) (raw[20] | (raw[21] << 8));
    s_calib.dig_P9 = (int16_t) (raw[22] | (raw[23] << 8));
    return ESP_OK;
}

/* Bosch BMP280 datasheet: returns temperature in 0.01 degC and updates t_fine. */
static int32_t compensate_temperature(int32_t adc_T)
{
    int32_t var1, var2;
    var1 = ((((adc_T >> 3) - ((int32_t)s_calib.dig_T1 << 1))) * ((int32_t)s_calib.dig_T2)) >> 11;
    var2 = (((((adc_T >> 4) - ((int32_t)s_calib.dig_T1)) *
              ((adc_T >> 4) - ((int32_t)s_calib.dig_T1))) >> 12) *
            ((int32_t)s_calib.dig_T3)) >> 14;
    s_t_fine = var1 + var2;
    return (s_t_fine * 5 + 128) >> 8;
}

/* Bosch BMP280 datasheet: returns pressure in Q24.8 Pa (i.e. value / 256 = Pa). */
static uint32_t compensate_pressure(int32_t adc_P)
{
    int64_t var1 = (int64_t)s_t_fine - 128000;
    int64_t var2 = var1 * var1 * (int64_t)s_calib.dig_P6;
    var2 = var2 + ((var1 * (int64_t)s_calib.dig_P5) << 17);
    var2 = var2 + (((int64_t)s_calib.dig_P4) << 35);
    var1 = ((var1 * var1 * (int64_t)s_calib.dig_P3) >> 8) +
           ((var1 * (int64_t)s_calib.dig_P2) << 12);
    var1 = (((((int64_t)1) << 47) + var1)) * ((int64_t)s_calib.dig_P1) >> 33;
    if (var1 == 0) {
        return 0;
    }
    int64_t p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = (((int64_t)s_calib.dig_P9) * (p >> 13) * (p >> 13)) >> 25;
    var2 = (((int64_t)s_calib.dig_P8) * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (((int64_t)s_calib.dig_P7) << 4);
    return (uint32_t)p;
}

esp_err_t baro_init(i2c_master_bus_handle_t bus)
{
    if (!bus) {
        ESP_LOGW(TAG, "no I2C bus supplied");
        return ESP_ERR_INVALID_ARG;
    }
    release_dev();
    s_baseline_valid = false;
    s_baseline_pa = 0.0;

    if (i2c_master_probe(bus, BARO_I2C_ADDR, BARO_XFER_TIMEOUT_MS) != ESP_OK) {
        ESP_LOGW(TAG, "no device at 0x%02X (check wiring / pull-ups / SDO->GND)", BARO_I2C_ADDR);
        return ESP_ERR_NOT_FOUND;
    }

    const i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address  = BARO_I2C_ADDR,
        .scl_speed_hz    = BARO_I2C_FREQ_HZ,
    };
    esp_err_t err = i2c_master_bus_add_device(bus, &dev_cfg, &s_dev);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_master_bus_add_device: %s", esp_err_to_name(err));
        return ESP_FAIL;
    }

    uint8_t chip_id = 0;
    err = baro_read_regs(BMP280_REG_ID, &chip_id, 1);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "chip id read failed: %s", esp_err_to_name(err));
        release_dev();
        return ESP_FAIL;
    }
    if (chip_id != BMP280_CHIP_ID && chip_id != BME280_CHIP_ID) {
        ESP_LOGW(TAG, "unexpected chip id 0x%02X (want 0x58 BMP280 or 0x60 BME280)", chip_id);
        release_dev();
        return ESP_ERR_NOT_FOUND;
    }

    /* soft reset, wait for NVM copy to complete before reading trimming params. */
    if (baro_write_reg(BMP280_REG_RESET, 0xB6) != ESP_OK) {
        release_dev();
        return ESP_FAIL;
    }
    /* Bosch spec: NVM copy in ~2 ms; allow margin. */
    for (int i = 0; i < 10; i++) {
        uint8_t status = 0;
        if (baro_read_regs(0xF3, &status, 1) == ESP_OK && (status & 0x01) == 0) {
            break;
        }
    }

    if (read_calibration() != ESP_OK) {
        ESP_LOGE(TAG, "calibration read failed");
        release_dev();
        return ESP_FAIL;
    }

    if (baro_write_reg(BMP280_REG_CONFIG, BMP280_CONFIG) != ESP_OK ||
        baro_write_reg(BMP280_REG_CTRL_MEAS, BMP280_CTRL_MEAS) != ESP_OK) {
        ESP_LOGE(TAG, "config/ctrl_meas write failed");
        release_dev();
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "BMP280/BME280 @ 0x%02X ready (chip_id=0x%02X), awaiting baseline", BARO_I2C_ADDR, chip_id);
    return ESP_OK;
}

bool baro_is_ready(void)
{
    return s_dev != NULL;
}

bool baro_read_relative_altitude_m(float *alt_m_out)
{
    if (!alt_m_out || !s_dev) {
        return false;
    }
    uint8_t raw[6];
    if (baro_read_regs(BMP280_REG_PRESS_MSB, raw, sizeof(raw)) != ESP_OK) {
        return false;
    }
    int32_t adc_P = ((int32_t)raw[0] << 12) | ((int32_t)raw[1] << 4) | ((int32_t)raw[2] >> 4);
    int32_t adc_T = ((int32_t)raw[3] << 12) | ((int32_t)raw[4] << 4) | ((int32_t)raw[5] >> 4);

    /* startup or reset returns 0x80000 on both channels; ignore those. */
    if (adc_P == 0x80000 || adc_T == 0x80000) {
        return false;
    }

    (void)compensate_temperature(adc_T); /* updates t_fine for pressure compensation. */
    uint32_t p_q24_8 = compensate_pressure(adc_P);
    if (p_q24_8 == 0) {
        return false;
    }
    double p_pa = (double)p_q24_8 / 256.0;

    if (!s_baseline_valid) {
        s_baseline_pa = p_pa;
        s_baseline_valid = true;
        ESP_LOGI(TAG, "baseline pressure latched: %.2f Pa", p_pa);
        *alt_m_out = 0.0f;
        return true;
    }

    double ratio = p_pa / s_baseline_pa;
    double alt_m = BARO_ALT_SCALE_M * (1.0 - pow(ratio, BARO_LAPSE_EXP));
    *alt_m_out = (float)alt_m;
    return true;
}
