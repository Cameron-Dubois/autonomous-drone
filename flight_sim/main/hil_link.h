//hil_link.h
//binary UART protocol for hardware-in-the-loop testing
//
//packet format:
//  [0xAA] [type] [payload...] [checksum]
//  checksum = XOR of type + all payload bytes
//
//sensor packet (PC → ESP32):  type 0x01, 24 bytes payload (6 floats)
//motor packet  (ESP32 → PC):  type 0x02, 24 bytes payload (4 duty u16 + 2 angle floats)

#pragma once

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define HIL_SYNC_BYTE   0xAA
#define HIL_TYPE_SENSOR 0x01
#define HIL_TYPE_MOTOR  0x02

//sensor data received from the bridge (simulated IMU readings)
typedef struct {
    float accel_x_g;    //g
    float accel_y_g;
    float accel_z_g;
    float gyro_x_dps;   //degrees per second
    float gyro_y_dps;
    float gyro_z_dps;
} hil_sensor_pkt_t;

//motor command sent back to the bridge
typedef struct {
    uint16_t duty[4];   //0-1023
    float pitch_deg;    //fused angle for telemetry
    float roll_deg;
} hil_motor_pkt_t;

//set up UART for HIL communication
esp_err_t hil_link_init(void);

//blocks until a complete sensor packet arrives, returns ESP_OK on success
//times out after timeout_ms and returns ESP_ERR_TIMEOUT
esp_err_t hil_receive_sensors(hil_sensor_pkt_t *pkt, int timeout_ms);

//sends a motor packet to the bridge
esp_err_t hil_send_motors(const hil_motor_pkt_t *pkt);

#ifdef __cplusplus
}
#endif
