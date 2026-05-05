//ble_command.c
//NimBLE BLE peripheral that speaks the same drone command protocol as
//drone_ble/main/gatt_svr.c, but for the flight controller. ARM / DISARM /
//ESTOP commands flow through registered callbacks set by main.c.

#include <assert.h>
#include <string.h>

#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"

#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#include "ble_command.h"

static const char *TAG = "ble_cmd";

void ble_store_config_init(void);

/* ---- Drone command protocol (mirrors drone_ble/main/bleprph.h) ----------- */

#define DRONE_CMD_NOP             0x00
#define DRONE_CMD_ARM             0x01
#define DRONE_CMD_DISARM          0x02
#define DRONE_CMD_ESTOP           0x03
#define DRONE_CMD_SET_MOTOR_1     0x10
#define DRONE_CMD_SET_MOTOR_2     0x11
#define DRONE_CMD_SET_MOTOR_3     0x12
#define DRONE_CMD_SET_MOTOR_4     0x13
#define DRONE_CMD_HEARTBEAT       0x20

#define DRONE_CMD_MAX_PAYLOAD     16
#define DRONE_CMD_MAX_LEN         (3 + DRONE_CMD_MAX_PAYLOAD)
#define DRONE_ACK_LEN             7

typedef struct {
    uint8_t seq;
    uint8_t cmd;
    uint8_t payload_len;
    uint8_t payload[DRONE_CMD_MAX_PAYLOAD];
} drone_cmd_t;

/* ---- Module state -------------------------------------------------------- */

static ble_command_callbacks_t s_cbs;
static uint8_t  s_own_addr_type;
static uint16_t s_chr_val_handle;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static bool     s_subscribed  = false;
static uint8_t  s_chr_val     = 0;   /* satisfies READs */

/* GATT UUIDs — must match mobile/src/comms/BLE/ble.real.ts and drone_ble. */
static const ble_uuid128_t s_svc_uuid =
    BLE_UUID128_INIT(0x2d, 0x71, 0xa2, 0x59, 0xb4, 0x58, 0xc8, 0x12,
                     0x99, 0x99, 0x43, 0x95, 0x12, 0x2f, 0x46, 0x59);

static const ble_uuid128_t s_chr_uuid =
    BLE_UUID128_INIT(0x00, 0x00, 0x00, 0x00, 0x11, 0x11, 0x11, 0x11,
                     0x22, 0x22, 0x22, 0x22, 0x33, 0x33, 0x33, 0x33);

/* ---- Helpers ------------------------------------------------------------- */

static uint32_t now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

static int parse_cmd(const uint8_t *buf, uint16_t len, drone_cmd_t *out)
{
    if (len < 3) return -1;
    out->seq = buf[0];
    out->cmd = buf[1];
    uint8_t plen = buf[2];
    if (plen > DRONE_CMD_MAX_PAYLOAD) return -2;
    if (len != (uint16_t)(3 + plen))  return -3;
    out->payload_len = plen;
    if (plen) memcpy(out->payload, &buf[3], plen);
    return 0;
}

/* status: 0 = OK, non-zero = error */
static void send_ack(uint16_t conn_handle, uint8_t seq, uint8_t cmd, uint8_t status)
{
    if (conn_handle == BLE_HS_CONN_HANDLE_NONE) return;

    uint8_t buf[DRONE_ACK_LEN];
    uint32_t ms = now_ms();
    buf[0] = seq;
    buf[1] = cmd;
    buf[2] = status;
    buf[3] = (uint8_t)(ms      );
    buf[4] = (uint8_t)(ms >>  8);
    buf[5] = (uint8_t)(ms >> 16);
    buf[6] = (uint8_t)(ms >> 24);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(buf, sizeof(buf));
    if (om == NULL) return;
    (void)ble_gatts_notify_custom(conn_handle, s_chr_val_handle, om);
}

static int dispatch_command(const drone_cmd_t *cmd)
{
    switch (cmd->cmd) {
    case DRONE_CMD_NOP:
        return 0;

    case DRONE_CMD_ARM:
        ESP_LOGW(TAG, "<- ARM seq=%u", cmd->seq);
        if (s_cbs.on_arm) s_cbs.on_arm();
        return 0;

    case DRONE_CMD_DISARM:
        ESP_LOGW(TAG, "<- DISARM seq=%u", cmd->seq);
        if (s_cbs.on_disarm) s_cbs.on_disarm();
        return 0;

    case DRONE_CMD_ESTOP:
        ESP_LOGE(TAG, "<- ESTOP seq=%u", cmd->seq);
        if (s_cbs.on_estop) s_cbs.on_estop();
        return 0;

    case DRONE_CMD_HEARTBEAT:
        if (s_cbs.on_heartbeat) s_cbs.on_heartbeat();
        return 0;

    case DRONE_CMD_SET_MOTOR_1:
    case DRONE_CMD_SET_MOTOR_2:
    case DRONE_CMD_SET_MOTOR_3:
    case DRONE_CMD_SET_MOTOR_4: {
        if (cmd->payload_len < 1) {
            ESP_LOGW(TAG, "SET_MOTOR missing throttle payload (id=0x%02x)", cmd->cmd);
            return -2;
        }
        int idx = (int)(cmd->cmd - DRONE_CMD_SET_MOTOR_1);   /* 0..3 */
        uint8_t throttle = cmd->payload[0];
        ESP_LOGI(TAG, "<- SET_MOTOR_%d throttle=%u seq=%u", idx + 1, throttle, cmd->seq);
        if (s_cbs.on_set_motor) s_cbs.on_set_motor(idx, throttle);
        return 0;
    }

    default:
        ESP_LOGW(TAG, "Unknown cmd id=0x%02x seq=%u", cmd->cmd, cmd->seq);
        return -10;
    }
}

/* ---- GATT access callback ------------------------------------------------ */

static int gatt_access(uint16_t conn_handle, uint16_t attr_handle,
                       struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_READ_CHR:
        if (attr_handle == s_chr_val_handle) {
            int rc = os_mbuf_append(ctxt->om, &s_chr_val, sizeof(s_chr_val));
            return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return BLE_ATT_ERR_UNLIKELY;

    case BLE_GATT_ACCESS_OP_WRITE_CHR:
        if (attr_handle != s_chr_val_handle) return BLE_ATT_ERR_UNLIKELY;
        {
            uint8_t buf[DRONE_CMD_MAX_LEN];
            uint16_t buf_len = OS_MBUF_PKTLEN(ctxt->om);
            drone_cmd_t cmd;
            uint8_t status = 0;

            if (buf_len > sizeof(buf)) {
                ESP_LOGW(TAG, "Write too large: %u", buf_len);
                return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            }
            int rc = ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof(buf), &buf_len);
            if (rc != 0) return BLE_ATT_ERR_UNLIKELY;

            int prc = parse_cmd(buf, buf_len, &cmd);
            if (prc != 0) {
                ESP_LOGW(TAG, "Parse failed rc=%d len=%u", prc, buf_len);
                if (buf_len >= 2) { cmd.seq = buf[0]; cmd.cmd = buf[1]; }
                else              { cmd.seq = 0;     cmd.cmd = DRONE_CMD_NOP; }
                cmd.payload_len = 0;
                status = (uint8_t)(-prc);
            } else {
                int hrc = dispatch_command(&cmd);
                status  = (uint8_t)(-hrc);
            }
            send_ack(conn_handle, cmd.seq, cmd.cmd, status);
            return 0;
        }

    default:
        return BLE_ATT_ERR_UNLIKELY;
    }
}

/* ---- GATT service definition --------------------------------------------- */

static const struct ble_gatt_svc_def s_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &s_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) { {
            .uuid       = &s_chr_uuid.u,
            .access_cb  = gatt_access,
            .flags      = BLE_GATT_CHR_F_READ  | BLE_GATT_CHR_F_WRITE |
                          BLE_GATT_CHR_F_NOTIFY | BLE_GATT_CHR_F_INDICATE,
            .val_handle = &s_chr_val_handle,
        }, { 0 } },
    },
    { 0 },
};

/* ---- Advertising --------------------------------------------------------- */

static int gap_event(struct ble_gap_event *event, void *arg);

static void start_advertising(void)
{
    struct ble_hs_adv_fields fields = {0};
    const char *name;
    int rc;

    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.tx_pwr_lvl_is_present = 1;
    fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;

    name = ble_svc_gap_device_name();
    fields.name = (uint8_t *)name;
    fields.name_len = strlen(name);
    fields.name_is_complete = 1;

    /* Advertise the 128-bit service UUID so the app could filter by it. */
    fields.uuids128 = (ble_uuid128_t *)&s_svc_uuid;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;

    rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_set_fields rc=%d (likely too long, dropping UUID)", rc);
        /* Retry without the 128-bit UUID — name+flags+tx is small enough. */
        fields.uuids128 = NULL;
        fields.num_uuids128 = 0;
        rc = ble_gap_adv_set_fields(&fields);
        if (rc != 0) {
            ESP_LOGE(TAG, "ble_gap_adv_set_fields fallback rc=%d", rc);
            return;
        }
    }

    struct ble_gap_adv_params adv_params = {0};
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    rc = ble_gap_adv_start(s_own_addr_type, NULL, BLE_HS_FOREVER,
                           &adv_params, gap_event, NULL);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gap_adv_start rc=%d", rc);
        return;
    }
    ESP_LOGI(TAG, "Advertising as 'DroneBLE'");
}

/* ---- GAP event handler --------------------------------------------------- */

static int gap_event(struct ble_gap_event *event, void *arg)
{
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        ESP_LOGI(TAG, "GAP connect status=%d handle=%d",
                 event->connect.status, event->connect.conn_handle);
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;
        } else {
            start_advertising();
        }
        return 0;

    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGW(TAG, "GAP disconnect reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        s_subscribed  = false;
        /* Safety: tell the flight controller the link is down. The application
         * decides whether to disarm; here we forward as DISARM via the
         * registered callback so user policy is in one place. */
        if (s_cbs.on_disarm) s_cbs.on_disarm();
        start_advertising();
        return 0;

    case BLE_GAP_EVENT_CONN_UPDATE:
    case BLE_GAP_EVENT_NOTIFY_TX:
    case BLE_GAP_EVENT_MTU:
        return 0;

    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_chr_val_handle) {
            s_subscribed = event->subscribe.cur_notify ||
                           event->subscribe.cur_indicate;
            ESP_LOGI(TAG, "subscribe notify=%d indicate=%d",
                     event->subscribe.cur_notify, event->subscribe.cur_indicate);
        }
        return 0;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        start_advertising();
        return 0;

    default:
        return 0;
    }
}

/* ---- Host task / sync hooks --------------------------------------------- */

static void on_reset(int reason)
{
    ESP_LOGW(TAG, "BLE host reset reason=%d", reason);
}

static void on_sync(void)
{
    int rc = ble_hs_util_ensure_addr(0);
    assert(rc == 0);
    rc = ble_hs_id_infer_auto(0, &s_own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_hs_id_infer_auto rc=%d", rc);
        return;
    }
    start_advertising();
}

static void host_task(void *param)
{
    nimble_port_run();
    nimble_port_freertos_deinit();
}

/* ---- Public API ---------------------------------------------------------- */

void ble_command_notify_text(const char *text)
{
    if (!s_subscribed || s_conn_handle == BLE_HS_CONN_HANDLE_NONE) return;
    if (text == NULL) return;
    size_t len = strlen(text);
    if (len > 96) len = 96;
    struct os_mbuf *om = ble_hs_mbuf_from_flat(text, len);
    if (om == NULL) return;
    (void)ble_gatts_notify_custom(s_conn_handle, s_chr_val_handle, om);
}

esp_err_t ble_command_init(const ble_command_callbacks_t *cbs)
{
    if (cbs == NULL) return ESP_ERR_INVALID_ARG;
    s_cbs = *cbs;

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    if (ret != ESP_OK) return ret;

    ret = nimble_port_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "nimble_port_init failed: %d", ret);
        return ret;
    }

    ble_hs_cfg.reset_cb        = on_reset;
    ble_hs_cfg.sync_cb         = on_sync;
    ble_hs_cfg.gatts_register_cb = NULL;
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    ble_hs_cfg.sm_io_cap       = 3; /* Just Works */

    ble_svc_gap_init();
    ble_svc_gatt_init();

    int rc = ble_gatts_count_cfg(s_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg rc=%d", rc);
        return ESP_FAIL;
    }
    rc = ble_gatts_add_svcs(s_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs rc=%d", rc);
        return ESP_FAIL;
    }

    rc = ble_svc_gap_device_name_set("DroneBLE");
    if (rc != 0) {
        ESP_LOGE(TAG, "set device name rc=%d", rc);
        return ESP_FAIL;
    }

    ble_store_config_init();
    nimble_port_freertos_init(host_task);

    ESP_LOGI(TAG, "BLE command server initialised");
    return ESP_OK;
}
