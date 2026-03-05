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

#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "bleprph.h"
#include "services/ans/ble_svc_ans.h"
#include "esp_timer.h"

/*** Maximum number of characteristics with the notify flag ***/
#define MAX_NOTIFY 5

static const ble_uuid128_t gatt_svr_svc_uuid =
    BLE_UUID128_INIT(0x2d, 0x71, 0xa2, 0x59, 0xb4, 0x58, 0xc8, 0x12,
                     0x99, 0x99, 0x43, 0x95, 0x12, 0x2f, 0x46, 0x59);

/* A characteristic that can be subscribed to */
static uint8_t gatt_svr_chr_val;
static uint16_t gatt_svr_chr_val_handle;
static const ble_uuid128_t gatt_svr_chr_uuid =
    BLE_UUID128_INIT(0x00, 0x00, 0x00, 0x00, 0x11, 0x11, 0x11, 0x11,
                     0x22, 0x22, 0x22, 0x22, 0x33, 0x33, 0x33, 0x33);

/* A custom descriptor */
static uint8_t gatt_svr_dsc_val;
static const ble_uuid128_t gatt_svr_dsc_uuid =
    BLE_UUID128_INIT(0x01, 0x01, 0x01, 0x01, 0x12, 0x12, 0x12, 0x12,
                     0x23, 0x23, 0x23, 0x23, 0x34, 0x34, 0x34, 0x34);

/*
 * Drone BLE command layer helpers
 */

/* Simple in-memory state for arming and per-motor throttle.
 * Real motor driver code can later read from or be called by these helpers. */
static bool g_drone_armed = false;
static uint8_t g_motor_throttle[4] = {0, 0, 0, 0}; /* 0–255 abstract throttle */

static void
drone_log_motor_state(void)
{
    MODLOG_DFLT(INFO,
                "motor_state armed=%d m1=%u m2=%u m3=%u m4=%u\n",
                g_drone_armed,
                g_motor_throttle[0],
                g_motor_throttle[1],
                g_motor_throttle[2],
                g_motor_throttle[3]);
}

static void
drone_set_all_motors(uint8_t throttle)
{
    for (int i = 0; i < 4; i++) {
        g_motor_throttle[i] = throttle;
    }
    drone_log_motor_state();
}

static void
drone_set_motor_index(int index, uint8_t throttle)
{
    if (index < 0 || index >= 4) {
        return;
    }
    g_motor_throttle[index] = throttle;
    drone_log_motor_state();
}

uint32_t
drone_get_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

static int
drone_send_ack(uint16_t conn_handle, uint16_t chr_val_handle,
               const drone_ack_t *ack)
{
    uint8_t buf[DRONE_ACK_LEN];
    struct os_mbuf *om;
    int rc;

    buf[0] = ack->seq;
    buf[1] = ack->cmd;
    buf[2] = ack->status;

    /* Little-endian encode of 32-bit ms timestamp. */
    buf[3] = (uint8_t)(ack->drone_ms & 0xFF);
    buf[4] = (uint8_t)((ack->drone_ms >> 8) & 0xFF);
    buf[5] = (uint8_t)((ack->drone_ms >> 16) & 0xFF);
    buf[6] = (uint8_t)((ack->drone_ms >> 24) & 0xFF);

    om = ble_hs_mbuf_from_flat(buf, sizeof(buf));
    if (om == NULL) {
        return BLE_HS_ENOMEM;
    }

    rc = ble_gatts_notify_custom(conn_handle, chr_val_handle, om);
    if (rc != 0) {
        MODLOG_DFLT(WARN, "Failed to send ACK notification; rc=%d\n", rc);
    }

    return rc;
}

int
drone_cmd_parse(const uint8_t *buf, uint16_t len, drone_cmd_t *out)
{
    uint8_t payload_len;

    if (len < 3) {
        return -1;
    }

    out->seq = buf[0];
    out->cmd = buf[1];
    payload_len = buf[2];

    if (payload_len > DRONE_CMD_MAX_PAYLOAD) {
        return -2;
    }

    if (len != (uint16_t)(3 + payload_len)) {
        return -3;
    }

    out->payload_len = payload_len;
    if (payload_len > 0) {
        memcpy(out->payload, &buf[3], payload_len);
    }

    return 0;
}

void
drone_ack_build(const drone_cmd_t *cmd, uint8_t status, uint32_t now_ms,
                drone_ack_t *out)
{
    out->seq = cmd->seq;
    out->cmd = cmd->cmd;
    out->status = status;
    out->drone_ms = now_ms;
}

int
drone_handle_command(const drone_cmd_t *cmd)
{
    switch (cmd->cmd) {
    case DRONE_CMD_NOP:
        MODLOG_DFLT(INFO, "DRONE_CMD_NOP seq=%u\n", cmd->seq);
        return 0;

    case DRONE_CMD_ARM:
        g_drone_armed = true;
        MODLOG_DFLT(INFO, "DRONE_CMD_ARM seq=%u\n", cmd->seq);
        drone_log_motor_state();
        return 0;

    case DRONE_CMD_DISARM:
        g_drone_armed = false;
        /* When disarmed, force all throttles to 0. */
        drone_set_all_motors(0);
        MODLOG_DFLT(INFO, "DRONE_CMD_DISARM seq=%u\n", cmd->seq);
        return 0;

    case DRONE_CMD_ESTOP:
        /* Emergency stop: clear armed flag and zero all motors immediately. */
        g_drone_armed = false;
        drone_set_all_motors(0);
        MODLOG_DFLT(INFO, "DRONE_CMD_ESTOP seq=%u\n", cmd->seq);
        return 0;

    case DRONE_CMD_SET_MOTOR_1:
    case DRONE_CMD_SET_MOTOR_2:
    case DRONE_CMD_SET_MOTOR_3:
    case DRONE_CMD_SET_MOTOR_4:
        if (!g_drone_armed) {
            MODLOG_DFLT(WARN,
                        "SET_MOTOR ignored while disarmed (id=0x%02x seq=%u)\n",
                        cmd->cmd, cmd->seq);
            return -1;
        }
        if (cmd->payload_len < 1) {
            MODLOG_DFLT(WARN,
                        "SET_MOTOR missing throttle payload (id=0x%02x seq=%u)\n",
                        cmd->cmd, cmd->seq);
            return -2;
        }
        /* Interpret payload[0] as a 0–255 abstract throttle. */
        switch (cmd->cmd) {
        case DRONE_CMD_SET_MOTOR_1:
            drone_set_motor_index(0, cmd->payload[0]);
            break;
        case DRONE_CMD_SET_MOTOR_2:
            drone_set_motor_index(1, cmd->payload[0]);
            break;
        case DRONE_CMD_SET_MOTOR_3:
            drone_set_motor_index(2, cmd->payload[0]);
            break;
        case DRONE_CMD_SET_MOTOR_4:
            drone_set_motor_index(3, cmd->payload[0]);
            break;
        default:
            break;
        }
        MODLOG_DFLT(INFO,
                    "DRONE_CMD_SET_MOTOR (id=0x%02x) seq=%u throttle=%u\n",
                    cmd->cmd, cmd->seq, cmd->payload[0]);
        return 0;

    case DRONE_CMD_HEARTBEAT:
        MODLOG_DFLT(DEBUG, "DRONE_CMD_HEARTBEAT seq=%u\n", cmd->seq);
        return 0;

    case DRONE_CMD_ASCEND:
    case DRONE_CMD_DESCEND:
    case DRONE_CMD_FOLLOW_TOGGLE:
        MODLOG_DFLT(INFO, "High-level command id=0x%02x seq=%u (not yet implemented)\n",
                    cmd->cmd, cmd->seq);
        return 0;

    default:
        MODLOG_DFLT(WARN, "Unknown command id=0x%02x seq=%u\n",
                    cmd->cmd, cmd->seq);
        return -10;
    }
}

static int
gatt_svc_access(uint16_t conn_handle, uint16_t attr_handle,
                struct ble_gatt_access_ctxt *ctxt,
                void *arg);

static const struct ble_gatt_svc_def gatt_svr_svcs[] = {
    {
        /*** Service ***/
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &gatt_svr_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[])
        { {
                /*** This characteristic can be subscribed to by writing 0x00 and 0x01 to the CCCD ***/
                .uuid = &gatt_svr_chr_uuid.u,
                .access_cb = gatt_svc_access,
#if CONFIG_EXAMPLE_ENCRYPTION
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE |
                BLE_GATT_CHR_F_READ_ENC | BLE_GATT_CHR_F_WRITE_ENC |
                BLE_GATT_CHR_F_NOTIFY | BLE_GATT_CHR_F_INDICATE,
#else
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_NOTIFY | BLE_GATT_CHR_F_INDICATE,
#endif
                .val_handle = &gatt_svr_chr_val_handle,
                .descriptors = (struct ble_gatt_dsc_def[])
                { {
                      .uuid = &gatt_svr_dsc_uuid.u,
#if CONFIG_EXAMPLE_ENCRYPTION
                      .att_flags = BLE_ATT_F_READ | BLE_ATT_F_READ_ENC,
#else
                      .att_flags = BLE_ATT_F_READ,
#endif
                      .access_cb = gatt_svc_access,
                    }, {
                      0, /* No more descriptors in this characteristic */
                    }
                },
            }, {
                0, /* No more characteristics in this service. */
            }
        },
    },

    {
        0, /* No more services. */
    },
};

static int
gatt_svr_write(struct os_mbuf *om, uint16_t min_len, uint16_t max_len,
               void *dst, uint16_t *len)
{
    uint16_t om_len;
    int rc;

    om_len = OS_MBUF_PKTLEN(om);
    if (om_len < min_len || om_len > max_len) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }

    rc = ble_hs_mbuf_to_flat(om, dst, max_len, len);
    if (rc != 0) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    return 0;
}

/**
 * Access callback whenever a characteristic/descriptor is read or written to.
 * Here reads and writes need to be handled.
 * ctxt->op tells weather the operation is read or write and
 * weather it is on a characteristic or descriptor,
 * ctxt->dsc->uuid tells which characteristic/descriptor is accessed.
 * attr_handle give the value handle of the attribute being accessed.
 * Accordingly do:
 *     Append the value to ctxt->om if the operation is READ
 *     Write ctxt->om to the value if the operation is WRITE
 **/
static int
gatt_svc_access(uint16_t conn_handle, uint16_t attr_handle,
                struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    const ble_uuid_t *uuid;
    int rc;

    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_READ_CHR:
        if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
            MODLOG_DFLT(INFO, "Characteristic read; conn_handle=%d attr_handle=%d\n",
                        conn_handle, attr_handle);
        } else {
            MODLOG_DFLT(INFO, "Characteristic read by NimBLE stack; attr_handle=%d\n",
                        attr_handle);
        }
        uuid = ctxt->chr->uuid;
        if (attr_handle == gatt_svr_chr_val_handle) {
            rc = os_mbuf_append(ctxt->om,
                                &gatt_svr_chr_val,
                                sizeof(gatt_svr_chr_val));
            return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        goto unknown;

    case BLE_GATT_ACCESS_OP_WRITE_CHR:
        if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
            MODLOG_DFLT(INFO, "Characteristic write; conn_handle=%d attr_handle=%d",
                        conn_handle, attr_handle);
        } else {
            MODLOG_DFLT(INFO, "Characteristic write by NimBLE stack; attr_handle=%d",
                        attr_handle);
        }
        uuid = ctxt->chr->uuid;
        if (attr_handle == gatt_svr_chr_val_handle) {
            uint8_t buf[DRONE_CMD_MAX_LEN];
            uint16_t buf_len = OS_MBUF_PKTLEN(ctxt->om);
            drone_cmd_t cmd;
            drone_ack_t ack;
            uint8_t status = 0;

            if (buf_len > sizeof(buf)) {
                MODLOG_DFLT(WARN, "Command write too large; len=%u\n", buf_len);
                return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            }

            rc = ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof(buf), &buf_len);
            if (rc != 0) {
                MODLOG_DFLT(WARN, "Failed to read command bytes from mbuf; rc=%d\n", rc);
                return BLE_ATT_ERR_UNLIKELY;
            }

            rc = drone_cmd_parse(buf, buf_len, &cmd);
            if (rc != 0) {
                MODLOG_DFLT(WARN, "Failed to parse command; rc=%d len=%u\n", rc, buf_len);
                /* Try to build an ACK with whatever header we have. */
                if (buf_len >= 2) {
                    cmd.seq = buf[0];
                    cmd.cmd = buf[1];
                } else {
                    cmd.seq = 0;
                    cmd.cmd = DRONE_CMD_NOP;
                }
                cmd.payload_len = 0;
                status = (uint8_t)(-rc);
            } else {
                status = (uint8_t)(-drone_handle_command(&cmd));
            }

            if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
                drone_ack_build(&cmd, status, drone_get_ms(), &ack);
                (void)drone_send_ack(conn_handle, gatt_svr_chr_val_handle, &ack);
            }

            return 0;
        }
        goto unknown;

    case BLE_GATT_ACCESS_OP_READ_DSC:
        if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
            MODLOG_DFLT(INFO, "Descriptor read; conn_handle=%d attr_handle=%d\n",
                        conn_handle, attr_handle);
        } else {
            MODLOG_DFLT(INFO, "Descriptor read by NimBLE stack; attr_handle=%d\n",
                        attr_handle);
        }
        uuid = ctxt->dsc->uuid;
        if (ble_uuid_cmp(uuid, &gatt_svr_dsc_uuid.u) == 0) {
            rc = os_mbuf_append(ctxt->om,
                                &gatt_svr_dsc_val,
                                sizeof(gatt_svr_chr_val));
            return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        goto unknown;

    case BLE_GATT_ACCESS_OP_WRITE_DSC:
        goto unknown;

    default:
        goto unknown;
    }

unknown:
    /* Unknown characteristic/descriptor;
     * The NimBLE host should not have called this function;
     */
    assert(0);
    return BLE_ATT_ERR_UNLIKELY;
}

void
gatt_svr_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg)
{
    char buf[BLE_UUID_STR_LEN];

    switch (ctxt->op) {
    case BLE_GATT_REGISTER_OP_SVC:
        MODLOG_DFLT(DEBUG, "registered service %s with handle=%d\n",
                    ble_uuid_to_str(ctxt->svc.svc_def->uuid, buf),
                    ctxt->svc.handle);
        break;

    case BLE_GATT_REGISTER_OP_CHR:
        MODLOG_DFLT(DEBUG, "registering characteristic %s with "
                    "def_handle=%d val_handle=%d\n",
                    ble_uuid_to_str(ctxt->chr.chr_def->uuid, buf),
                    ctxt->chr.def_handle,
                    ctxt->chr.val_handle);
        break;

    case BLE_GATT_REGISTER_OP_DSC:
        MODLOG_DFLT(DEBUG, "registering descriptor %s with handle=%d\n",
                    ble_uuid_to_str(ctxt->dsc.dsc_def->uuid, buf),
                    ctxt->dsc.handle);
        break;

    default:
        assert(0);
        break;
    }
}

int
gatt_svr_init(void)
{
    int rc;

    ble_svc_gap_init();
    ble_svc_gatt_init();
    ble_svc_ans_init();

    rc = ble_gatts_count_cfg(gatt_svr_svcs);
    if (rc != 0) {
        return rc;
    }

    rc = ble_gatts_add_svcs(gatt_svr_svcs);
    if (rc != 0) {
        return rc;
    }

    /* Setting a value for the read-only descriptor */
    gatt_svr_dsc_val = 0x99;

    return 0;
}
