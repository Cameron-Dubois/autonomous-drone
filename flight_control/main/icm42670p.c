//icm42670p.c
//driver implementation for the ICM-42670-P IMU
//handles I2C bus setup, sensor configuration, and reading 6-axis data

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "driver/i2c_master.h"
#include "icm42670p.h"

static const char *TAG = "icm42670p";

//how long to wait for an I2C transaction before giving up
#define I2C_TIMEOUT_MS  100

//internal driver state
struct icm42670p_dev {
    i2c_master_dev_handle_t i2c_dev;   //handle to talk to the IMU
    i2c_master_bus_handle_t i2c_bus;   //handle for the I2C bus itself
    float accel_sensitivity;           //LSB per g for the configured range
    float gyro_sensitivity;            //LSB per dps for the configured range
};

//single static instance since we only have one IMU on the board
static struct icm42670p_dev s_dev;

//writes one byte to a register on the IMU
static esp_err_t reg_write(icm42670p_handle_t dev, uint8_t reg, uint8_t val)
{
    //I2C write: first byte is register address, second is the value
    uint8_t buf[2] = { reg, val };
    return i2c_master_transmit(dev->i2c_dev, buf, sizeof(buf), I2C_TIMEOUT_MS);
}

//reads len bytes starting at a register address
static esp_err_t reg_read(icm42670p_handle_t dev, uint8_t reg, uint8_t *val, size_t len)
{
    //I2C write-then-read: send the register address, then read back data
    //the IMU auto-increments the register pointer so we can burst-read
    return i2c_master_transmit_receive(dev->i2c_dev, &reg, 1, val, len, I2C_TIMEOUT_MS);
}

//returns the gyro sensitivity (LSB per dps) based on the FS bits in config byte
//bits [6:5] of GYRO_CONFIG0 select the full-scale range
static float gyro_sensitivity_from_config(uint8_t cfg)
{
    switch ((cfg >> 5) & 0x03) {
        case 0:  return GYRO_SENSITIVITY_2000DPS;
        case 1:  return GYRO_SENSITIVITY_1000DPS;
        case 2:  return GYRO_SENSITIVITY_500DPS;
        default: return GYRO_SENSITIVITY_250DPS;
    }
}

//returns the accel sensitivity (LSB per g) based on the FS bits in config byte
//bits [6:5] of ACCEL_CONFIG0 select the full-scale range
static float accel_sensitivity_from_config(uint8_t cfg)
{
    switch ((cfg >> 5) & 0x03) {
        case 0:  return ACCEL_SENSITIVITY_16G;
        case 1:  return ACCEL_SENSITIVITY_8G;
        case 2:  return ACCEL_SENSITIVITY_4G;
        default: return ACCEL_SENSITIVITY_2G;
    }
}

//initializes the I2C bus, talks to the IMU, configures it, and powers it on
esp_err_t icm42670p_init(uint8_t gyro_config0,
                         uint8_t accel_config0,
                         icm42670p_handle_t *handle)
{
    esp_err_t ret;
    icm42670p_handle_t dev = &s_dev;

    //create the I2C master bus using the GPIO pins from menuconfig
    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = CONFIG_IMU_I2C_SDA_GPIO,
        .scl_io_num = CONFIG_IMU_I2C_SCL_GPIO,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,  //use the ESP32's built-in pull-ups
    };
    ret = i2c_new_master_bus(&bus_cfg, &dev->i2c_bus);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to create I2C bus: %s", esp_err_to_name(ret));
        return ret;
    }

    //register the IMU as a device on the bus with its 7-bit address
    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = ICM42670P_I2C_ADDR,
        .scl_speed_hz = CONFIG_IMU_I2C_FREQ_HZ,
    };
    ret = i2c_master_bus_add_device(dev->i2c_bus, &dev_cfg, &dev->i2c_dev);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add I2C device: %s", esp_err_to_name(ret));
        return ret;
    }

    //datasheet says wait at least 1ms after power-on before register access
    vTaskDelay(pdMS_TO_TICKS(10));

    //software reset the IMU to start from a known state
    //bit 4 of SIGNAL_PATH_RESET triggers the reset
    ret = reg_write(dev, REG_SIGNAL_PATH_RESET, 0x10);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Soft reset write failed: %s", esp_err_to_name(ret));
        return ret;
    }
    //the datasheet says 1ms typical but the device can take much longer
    //after a cold power-on; 100ms is conservative and safe
    vTaskDelay(pdMS_TO_TICKS(100));

    //read the WHO_AM_I register to make sure we're actually talking to an ICM-42670-P
    //if this fails, the sensor probably isn't wired correctly
    uint8_t who = 0;
    ret = reg_read(dev, REG_WHO_AM_I, &who, 1);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "WHO_AM_I read failed: %s", esp_err_to_name(ret));
        return ret;
    }
    if (who != ICM42670P_WHO_AM_I_VAL) {
        ESP_LOGE(TAG, "WHO_AM_I mismatch: expected 0x%02X, got 0x%02X",
                 ICM42670P_WHO_AM_I_VAL, who);
        return ESP_ERR_INVALID_RESPONSE;
    }
    ESP_LOGI(TAG, "WHO_AM_I = 0x%02X - sensor found", who);

    //poll until the internal clock is running
    //bit 3 of MCLK_RDY goes high when the clock is ready
    for (int i = 0; i < 50; i++) {
        uint8_t rdy = 0;
        reg_read(dev, REG_MCLK_RDY, &rdy, 1);
        if (rdy & 0x08) break;
        vTaskDelay(pdMS_TO_TICKS(1));
    }

    //write the gyro config (full-scale range + output data rate)
    ret = reg_write(dev, REG_GYRO_CONFIG0, gyro_config0);
    if (ret != ESP_OK) return ret;

    //write the accel config (full-scale range + output data rate)
    ret = reg_write(dev, REG_ACCEL_CONFIG0, accel_config0);
    if (ret != ESP_OK) return ret;

    //turn on both sensors in low-noise mode
    //this writes 0x0F to PWR_MGMT0 (gyro LN = bits[3:2]=11, accel LN = bits[1:0]=11)
    ret = reg_write(dev, REG_PWR_MGMT0, PWR_GYRO_MODE_LN | PWR_ACCEL_MODE_LN);
    if (ret != ESP_OK) return ret;

    //the gyro needs at least 45ms to start up after being powered on
    //we wait 50ms to be safe before trying to read data
    vTaskDelay(pdMS_TO_TICKS(50));

    //store the sensitivity values so we can convert raw readings later
    dev->gyro_sensitivity  = gyro_sensitivity_from_config(gyro_config0);
    dev->accel_sensitivity = accel_sensitivity_from_config(accel_config0);

    ESP_LOGI(TAG, "Gyro  FS cfg=0x%02X  sens=%.1f LSB/dps", gyro_config0, dev->gyro_sensitivity);
    ESP_LOGI(TAG, "Accel FS cfg=0x%02X  sens=%.1f LSB/g",   accel_config0, dev->accel_sensitivity);

    *handle = dev;
    return ESP_OK;
}

//reads all 6 axes plus temperature in one I2C burst read
//the 14 bytes from 0x09 to 0x16 are: temp(2) + accel XYZ(6) + gyro XYZ(6)
//each axis is a 16-bit signed value, high byte first
esp_err_t icm42670p_read_raw(icm42670p_handle_t dev, icm42670p_raw_t *raw)
{
    uint8_t buf[14];

    //burst-read all 14 bytes starting at TEMP_DATA1 (0x09)
    esp_err_t ret = reg_read(dev, REG_TEMP_DATA1, buf, sizeof(buf));
    if (ret != ESP_OK) return ret;

    //combine high and low bytes into signed 16-bit values
    //buf[0..1] = temperature
    //buf[2..7] = accel X, Y, Z
    //buf[8..13] = gyro X, Y, Z
    raw->temp_raw = (int16_t)((buf[0]  << 8) | buf[1]);
    raw->accel_x  = (int16_t)((buf[2]  << 8) | buf[3]);
    raw->accel_y  = (int16_t)((buf[4]  << 8) | buf[5]);
    raw->accel_z  = (int16_t)((buf[6]  << 8) | buf[7]);
    raw->gyro_x   = (int16_t)((buf[8]  << 8) | buf[9]);
    raw->gyro_y   = (int16_t)((buf[10] << 8) | buf[11]);
    raw->gyro_z   = (int16_t)((buf[12] << 8) | buf[13]);

    return ESP_OK;
}

//reads raw data then converts to real-world units
//accel values in g, gyro values in degrees per second, temp in celsius
esp_err_t icm42670p_read(icm42670p_handle_t dev, icm42670p_data_t *data)
{
    icm42670p_raw_t raw;
    esp_err_t ret = icm42670p_read_raw(dev, &raw);
    if (ret != ESP_OK) return ret;

    //divide raw values by the sensitivity to get physical units
    data->accel_x_g  = (float)raw.accel_x / dev->accel_sensitivity;
    data->accel_y_g  = (float)raw.accel_y / dev->accel_sensitivity;
    data->accel_z_g  = (float)raw.accel_z / dev->accel_sensitivity;
    data->gyro_x_dps = (float)raw.gyro_x  / dev->gyro_sensitivity;
    data->gyro_y_dps = (float)raw.gyro_y  / dev->gyro_sensitivity;
    data->gyro_z_dps = (float)raw.gyro_z  / dev->gyro_sensitivity;

    //temperature formula from the datasheet: temp_C = (raw / 128) + 25
    data->temp_c     = (float)raw.temp_raw / 128.0f + 25.0f;

    return ESP_OK;
}
