/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

#ifndef H_BLEPRPH_
#define H_BLEPRPH_

#include <stdbool.h>
#include <stdint.h>
#include "nimble/ble.h"
#include "modlog/modlog.h"
#include "esp_peripheral.h"

#ifdef __cplusplus
extern "C" {
#endif

struct ble_hs_cfg;
struct ble_gatt_register_ctxt;

/** GATT server (existing alert service UUIDs kept for reference). */
#define GATT_SVR_SVC_ALERT_UUID               0x1811
#define GATT_SVR_CHR_SUP_NEW_ALERT_CAT_UUID   0x2A47
#define GATT_SVR_CHR_NEW_ALERT                0x2A46
#define GATT_SVR_CHR_SUP_UNR_ALERT_CAT_UUID   0x2A48
#define GATT_SVR_CHR_UNR_ALERT_STAT_UUID      0x2A45
#define GATT_SVR_CHR_ALERT_NOT_CTRL_PT        0x2A44

/*
 * Drone command protocol definitions
 */

typedef enum {
    DRONE_CMD_NOP            = 0x00, /* Reserved / test */
    DRONE_CMD_ARM            = 0x01,
    DRONE_CMD_DISARM         = 0x02,
    DRONE_CMD_ESTOP          = 0x03,

    DRONE_CMD_SET_MOTOR_1    = 0x10,
    DRONE_CMD_SET_MOTOR_2    = 0x11,
    DRONE_CMD_SET_MOTOR_3    = 0x12,
    DRONE_CMD_SET_MOTOR_4    = 0x13,

    DRONE_CMD_HEARTBEAT      = 0x20,

    /* Placeholders for future high-level flight commands. */
    DRONE_CMD_ASCEND         = 0x30,
    DRONE_CMD_DESCEND        = 0x31,
    DRONE_CMD_FOLLOW_TOGGLE  = 0x32,
    DRONE_CMD_LOST_TOGGLE    = 0x33,

    DRONE_CMD_MAX_VALUE
} drone_cmd_id_t;

#define DRONE_CMD_MAX_PAYLOAD   16
#define DRONE_CMD_MAX_LEN       (3 + DRONE_CMD_MAX_PAYLOAD)  /* seq + cmd + len + payload */
#define DRONE_ACK_LEN           7                            /* seq + cmd + status + 4-byte ms */

typedef struct {
    uint8_t  seq;
    uint8_t  cmd;          /* drone_cmd_id_t */
    uint8_t  payload_len;
    uint8_t  payload[DRONE_CMD_MAX_PAYLOAD];
} drone_cmd_t;

typedef struct {
    uint8_t  seq;
    uint8_t  cmd;          /* drone_cmd_id_t */
    uint8_t  status;       /* 0 = OK, non-zero = error */
    uint32_t drone_ms;     /* ms since boot */
} drone_ack_t;

/* Protocol helper APIs (implemented in the BLE firmware). */
uint32_t drone_get_ms(void);
int drone_cmd_parse(const uint8_t *buf, uint16_t len, drone_cmd_t *out);
void drone_ack_build(const drone_cmd_t *cmd, uint8_t status, uint32_t now_ms, drone_ack_t *out);
int drone_handle_command(const drone_cmd_t *cmd);

/* GATT server hooks used by main.c */
void gatt_svr_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg);
int gatt_svr_init(void);

#ifdef __cplusplus
}
#endif

#endif
