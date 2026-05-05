//icm42670p.h
//driver header for the ICM-42670-P 6-axis IMU over I2C
//register addresses, config macros, and public API

#pragma once

#include "esp_err.h"
#include "driver/i2c_master.h"

#ifdef __cplusplus
extern "C" {
#endif

//7-bit I2C address depends on how the AD0 pin is wired
//AD0 to GND = 0x68 (default), AD0 to VCC = 0x69
#ifdef CONFIG_IMU_AD0_HIGH
#define ICM42670P_I2C_ADDR  0x69
#else
#define ICM42670P_I2C_ADDR  0x68
#endif

//expected value when reading the WHO_AM_I register
#define ICM42670P_WHO_AM_I_VAL  0x67

//user bank 0 register addresses (from datasheet DS-000451)
#define REG_MCLK_RDY           0x00  //bit 3 = 1 when internal clock is running
#define REG_DEVICE_CONFIG      0x01
#define REG_SIGNAL_PATH_RESET  0x02  //bit 4 = software reset
#define REG_TEMP_DATA1         0x09  //temperature high byte
#define REG_TEMP_DATA0         0x0A  //temperature low byte
#define REG_ACCEL_DATA_X1      0x0B  //start of 14 contiguous data bytes
#define REG_ACCEL_DATA_X0      0x0C
#define REG_ACCEL_DATA_Y1      0x0D
#define REG_ACCEL_DATA_Y0      0x0E
#define REG_ACCEL_DATA_Z1      0x0F
#define REG_ACCEL_DATA_Z0      0x10
#define REG_GYRO_DATA_X1       0x11
#define REG_GYRO_DATA_X0       0x12
#define REG_GYRO_DATA_Y1       0x13
#define REG_GYRO_DATA_Y0       0x14
#define REG_GYRO_DATA_Z1       0x15
#define REG_GYRO_DATA_Z0       0x16  //end of data block
#define REG_PWR_MGMT0          0x1F  //turns gyro and accel on/off
#define REG_GYRO_CONFIG0       0x20  //gyro full-scale range + output data rate
#define REG_ACCEL_CONFIG0      0x21  //accel full-scale range + output data rate
#define REG_GYRO_CONFIG1       0x23  //gyro low-pass filter bandwidth
#define REG_ACCEL_CONFIG1      0x24  //accel low-pass filter bandwidth
#define REG_INT_STATUS_DRDY    0x39  //data ready interrupt status
#define REG_WHO_AM_I           0x75  //chip ID register, should read 0x67

//PWR_MGMT0 register bit fields
//gyro mode sits in bits [3:2]
#define PWR_GYRO_MODE_OFF      (0x00 << 2)
#define PWR_GYRO_MODE_STANDBY  (0x01 << 2)
#define PWR_GYRO_MODE_LN       (0x03 << 2)  //low-noise mode

//accel mode sits in bits [1:0]
#define PWR_ACCEL_MODE_OFF     0x00
#define PWR_ACCEL_MODE_LP      0x02  //low-power mode
#define PWR_ACCEL_MODE_LN      0x03  //low-noise mode

//GYRO_CONFIG0: full-scale range in bits [6:5]
#define GYRO_FS_2000DPS  (0x00 << 5)  //sensitivity 16.4 LSB per dps
#define GYRO_FS_1000DPS  (0x01 << 5)  //sensitivity 32.8 LSB per dps
#define GYRO_FS_500DPS   (0x02 << 5)  //sensitivity 65.5 LSB per dps
#define GYRO_FS_250DPS   (0x03 << 5)  //sensitivity 131 LSB per dps

//GYRO_CONFIG0: output data rate in bits [3:0]
#define GYRO_ODR_1600HZ  0x05
#define GYRO_ODR_800HZ   0x06
#define GYRO_ODR_400HZ   0x07
#define GYRO_ODR_200HZ   0x08
#define GYRO_ODR_100HZ   0x09
#define GYRO_ODR_50HZ    0x0A
#define GYRO_ODR_25HZ    0x0B
#define GYRO_ODR_12_5HZ  0x0C

//ACCEL_CONFIG0: full-scale range in bits [6:5]
#define ACCEL_FS_16G  (0x00 << 5)  //sensitivity 2048 LSB per g
#define ACCEL_FS_8G   (0x01 << 5)  //sensitivity 4096 LSB per g
#define ACCEL_FS_4G   (0x02 << 5)  //sensitivity 8192 LSB per g
#define ACCEL_FS_2G   (0x03 << 5)  //sensitivity 16384 LSB per g

//ACCEL_CONFIG0: output data rate in bits [3:0]
#define ACCEL_ODR_1600HZ  0x05
#define ACCEL_ODR_800HZ   0x06
#define ACCEL_ODR_400HZ   0x07
#define ACCEL_ODR_200HZ   0x08
#define ACCEL_ODR_100HZ   0x09
#define ACCEL_ODR_50HZ    0x0A
#define ACCEL_ODR_25HZ    0x0B
#define ACCEL_ODR_12_5HZ  0x0C

//sensitivity scale factors used to convert raw readings to physical units
//these come straight from table 1 and table 2 in the datasheet
#define GYRO_SENSITIVITY_2000DPS  16.4f    //LSB per degree/sec
#define GYRO_SENSITIVITY_1000DPS  32.8f
#define GYRO_SENSITIVITY_500DPS   65.5f
#define GYRO_SENSITIVITY_250DPS   131.0f

#define ACCEL_SENSITIVITY_16G  2048.0f     //LSB per g
#define ACCEL_SENSITIVITY_8G   4096.0f
#define ACCEL_SENSITIVITY_4G   8192.0f
#define ACCEL_SENSITIVITY_2G   16384.0f

//holds the raw 16-bit signed values straight from the sensor registers
typedef struct {
    int16_t accel_x;
    int16_t accel_y;
    int16_t accel_z;
    int16_t gyro_x;
    int16_t gyro_y;
    int16_t gyro_z;
    int16_t temp_raw;
} icm42670p_raw_t;

//holds converted physical units (g, degrees/sec, celsius)
typedef struct {
    float accel_x_g;
    float accel_y_g;
    float accel_z_g;
    float gyro_x_dps;
    float gyro_y_dps;
    float gyro_z_dps;
    float temp_c;
} icm42670p_data_t;

//opaque handle pointer, actual struct is defined in icm42670p.c
typedef struct icm42670p_dev *icm42670p_handle_t;

//sets up I2C, verifies WHO_AM_I, configures gyro + accel, and powers them on
//gyro_config0: OR together a GYRO_FS_* and a GYRO_ODR_* value
//accel_config0: OR together an ACCEL_FS_* and an ACCEL_ODR_* value
//handle: gets set to the driver handle on success
esp_err_t icm42670p_init(uint8_t gyro_config0,
                         uint8_t accel_config0,
                         icm42670p_handle_t *handle);

//reads all 14 data bytes in one burst and returns raw 16-bit values
esp_err_t icm42670p_read_raw(icm42670p_handle_t dev, icm42670p_raw_t *raw);

//same as read_raw but converts to g, dps, and celsius using
//the full-scale range that was set during init
esp_err_t icm42670p_read(icm42670p_handle_t dev, icm42670p_data_t *data);

#ifdef __cplusplus
}
#endif
