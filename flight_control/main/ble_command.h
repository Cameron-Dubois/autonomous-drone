//ble_command.h
//Public API for the flight controller's BLE command module.
//
//Talks the same wire protocol as drone_ble (so the existing mobile app works
//unchanged): one GATT service with one read/write/notify characteristic that
//accepts a binary [seq][cmd][payload_len][payload...] frame and returns a
//[seq][cmd][status][ms32 little-endian] ACK as a notification.
//
//Wire format details:
//  Service UUID:        59462f12-9543-9999-12c8-58b459a2712d
//  Characteristic UUID: 33333333-2222-2222-1111-111100000000
//  Device name:         DroneBLE
//  Cmd IDs:             0x01 ARM, 0x02 DISARM, 0x03 ESTOP, 0x20 HEARTBEAT
//                       (extra IDs are accepted and ack'd but do nothing)
//
//Callbacks fire from the NimBLE host task. Don't do real work in them — flip
//a flag and let the main flight loop consume it. See main.c.

#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    void (*on_arm)(void);
    void (*on_disarm)(void);
    void (*on_estop)(void);
    void (*on_heartbeat)(void);
    /* Per-motor throttle command from the app. motor_index is 0..3 mapping to
     * MOTOR_1..MOTOR_4; throttle is 0..255 (mobile-app convention). The
     * application is responsible for honouring or ignoring the request based
     * on its own state (e.g. flight controllers should ignore while armed). */
    void (*on_set_motor)(int motor_index, uint8_t throttle);
} ble_command_callbacks_t;

//Initialise NVS, NimBLE, the GATT server, and start advertising as DroneBLE.
//Returns ESP_OK on success; logs and returns the underlying error otherwise.
esp_err_t ble_command_init(const ble_command_callbacks_t *cbs);

//Optional: push a one-line telemetry string to subscribed centrals via
//notification on the same characteristic. Safe to call from any task.
//Truncates strings longer than 96 bytes to fit a default ATT MTU comfortably.
void ble_command_notify_text(const char *text);

#ifdef __cplusplus
}
#endif
