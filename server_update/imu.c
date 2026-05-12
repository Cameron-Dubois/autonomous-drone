/*
 * imu.c - MPU6050 IMU driver
 *
 * Configured for:
 *   - Gyro range  : +/- 2000 deg/s (FS_SEL=3)
 *   - Accel range : +/- 8 g        (AFS_SEL=2)
 *   - DLPF        : 98 Hz / sample rate divider so output rate >= LOOP_HZ
 *
 * The C3 has only one I2C peripheral, but that's all we need.  We use the
 * legacy `driver/i2c.h` API for portability across ESP-IDF v4 and v5.
 */
#include "imu.h"

#include <string.h>
#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "app_config.h"

static const char *TAG = "imu";

/* MPU6050 register map (only what we touch) */
#define REG_SMPLRT_DIV      0x19
#define REG_CONFIG          0x1A
#define REG_GYRO_CONFIG     0x1B
#define REG_ACCEL_CONFIG    0x1C
#define REG_ACCEL_XOUT_H    0x3B
#define REG_PWR_MGMT_1      0x6B
#define REG_WHO_AM_I        0x75

/* Scale factors for our chosen ranges */
#define GYRO_LSB_PER_DPS    16.4f      /* +/- 2000 dps */
#define ACCEL_LSB_PER_G     4096.0f    /* +/- 8 g     */

static float s_gyro_bias[3] = {0};

/* ---------- I2C helpers ----------------------------------------------- */
static esp_err_t i2c_write_reg(uint8_t reg, uint8_t val)
{
    uint8_t buf[2] = { reg, val };
    return i2c_master_write_to_device(IMU_I2C_PORT, IMU_I2C_ADDR,
                                      buf, sizeof(buf),
                                      pdMS_TO_TICKS(10));
}

static esp_err_t i2c_read_regs(uint8_t reg, uint8_t *dst, size_t n)
{
    return i2c_master_write_read_device(IMU_I2C_PORT, IMU_I2C_ADDR,
                                        &reg, 1,
                                        dst, n,
                                        pdMS_TO_TICKS(10));
}

/* ---------- Public API ------------------------------------------------ */
esp_err_t imu_init(void)
{
    /* Bring up the I2C bus first.  Internal pull-ups are weak; if the
     * board doesn't have externals you'll see flaky reads -- add 4.7k
     * to 3V3 on each line. */
    const i2c_config_t cfg = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = IMU_I2C_SDA_GPIO,
        .scl_io_num = IMU_I2C_SCL_GPIO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = IMU_I2C_FREQ_HZ,
    };
    esp_err_t err = i2c_param_config(IMU_I2C_PORT, &cfg);
    if (err != ESP_OK) return err;
    err = i2c_driver_install(IMU_I2C_PORT, cfg.mode, 0, 0, 0);
    if (err != ESP_OK) return err;

    /* Wake from sleep, select PLL with X-gyro as clock source -- gives the
     * most stable timing on the MPU6050. */
    err = i2c_write_reg(REG_PWR_MGMT_1, 0x01);
    if (err != ESP_OK) return err;
    vTaskDelay(pdMS_TO_TICKS(50));

    /* Verify silicon: WHO_AM_I should read 0x68 (or 0x70/0x71/0x72/0x73
     * for MPU6500/9250 variants -- accept those too in case the board
     * uses a clone). */
    uint8_t who = 0;
    err = i2c_read_regs(REG_WHO_AM_I, &who, 1);
    if (err != ESP_OK) return err;
    if (who != 0x68 && who != 0x70 && who != 0x71 && who != 0x72 && who != 0x73) {
        ESP_LOGE(TAG, "Unexpected WHO_AM_I: 0x%02x", who);
        return ESP_ERR_NOT_FOUND;
    }
    ESP_LOGI(TAG, "IMU detected, WHO_AM_I=0x%02x", who);

    /* DLPF_CFG=2 -> 98 Hz gyro / 1 kHz internal sample rate.
     * SMPLRT_DIV=0  -> output rate = 1 kHz / (1 + 0) = 1 kHz. */
    if ((err = i2c_write_reg(REG_CONFIG, 0x02)) != ESP_OK) return err;
    if ((err = i2c_write_reg(REG_SMPLRT_DIV, 0x00)) != ESP_OK) return err;

    /* +/- 2000 dps gyro, +/- 8 g accel */
    if ((err = i2c_write_reg(REG_GYRO_CONFIG, 0x18)) != ESP_OK) return err;
    if ((err = i2c_write_reg(REG_ACCEL_CONFIG, 0x10)) != ESP_OK) return err;

    return ESP_OK;
}

esp_err_t imu_read(imu_sample_t *out)
{
    /* Burst-read 14 bytes: ax, ay, az, temp, gx, gy, gz */
    uint8_t buf[14];
    esp_err_t err = i2c_read_regs(REG_ACCEL_XOUT_H, buf, sizeof(buf));
    if (err != ESP_OK) return err;

    int16_t raw_ax = (int16_t)((buf[0]  << 8) | buf[1]);
    int16_t raw_ay = (int16_t)((buf[2]  << 8) | buf[3]);
    int16_t raw_az = (int16_t)((buf[4]  << 8) | buf[5]);
    /* buf[6..7] is temperature -- skip */
    int16_t raw_gx = (int16_t)((buf[8]  << 8) | buf[9]);
    int16_t raw_gy = (int16_t)((buf[10] << 8) | buf[11]);
    int16_t raw_gz = (int16_t)((buf[12] << 8) | buf[13]);

    out->ax = (float)raw_ax / ACCEL_LSB_PER_G;
    out->ay = (float)raw_ay / ACCEL_LSB_PER_G;
    out->az = (float)raw_az / ACCEL_LSB_PER_G;
    out->gx = (float)raw_gx / GYRO_LSB_PER_DPS - s_gyro_bias[0];
    out->gy = (float)raw_gy / GYRO_LSB_PER_DPS - s_gyro_bias[1];
    out->gz = (float)raw_gz / GYRO_LSB_PER_DPS - s_gyro_bias[2];

    return ESP_OK;
}

esp_err_t imu_calibrate_gyro_bias(void)
{
    /* Average ~1 s of samples while the airframe is held still.  The
     * accelerometer doesn't need this -- gravity dominates and the
     * complementary filter pulls roll/pitch back to truth.  But the
     * gyro DC bias drifts from chip to chip and with temperature, so
     * we cancel it explicitly. */
    const int N = 500;
    float sum[3] = {0};
    s_gyro_bias[0] = s_gyro_bias[1] = s_gyro_bias[2] = 0;

    for (int i = 0; i < N; i++) {
        imu_sample_t s;
        esp_err_t err = imu_read(&s);
        if (err != ESP_OK) return err;
        sum[0] += s.gx;
        sum[1] += s.gy;
        sum[2] += s.gz;
        vTaskDelay(pdMS_TO_TICKS(2));
    }
    s_gyro_bias[0] = sum[0] / (float)N;
    s_gyro_bias[1] = sum[1] / (float)N;
    s_gyro_bias[2] = sum[2] / (float)N;
    ESP_LOGI(TAG, "Gyro bias: %.3f %.3f %.3f deg/s",
             s_gyro_bias[0], s_gyro_bias[1], s_gyro_bias[2]);
    return ESP_OK;
}
