#include "wifi_link.h"

#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "app_config.h"

static const char *TAG = "wifi";

#pragma pack(push, 1)
typedef struct {
    uint8_t  magic[2];
    uint8_t  version;
    uint8_t  flags;
    int16_t  throttle;
    int16_t  roll;
    int16_t  pitch;
    int16_t  yaw;
    uint32_t seq;
} ctrl_pkt_t;

typedef struct {
    uint8_t  magic[2];   /* "DT" */
    uint8_t  version;
    uint8_t  armed;
    int16_t  roll_cdeg;   /* deg * 100 */
    int16_t  pitch_cdeg;
    int16_t  yaw_cdeg;
    uint16_t throttle_pm; /* per-mil */
    uint32_t loop_us;     /* most recent flight-loop period */
} telem_pkt_t;
#pragma pack(pop)

static SemaphoreHandle_t s_lock;
static ctrl_input_t       s_latest;
static int                s_sock = -1;
static struct sockaddr_in s_peer;          /* last sender, for telemetry */
static bool               s_have_peer = false;

static inline bool packet_valid(const ctrl_pkt_t *p)
{
    return p->magic[0] == 'D' && p->magic[1] == 'C' && p->version == 1;
}

static void parse_packet(const ctrl_pkt_t *p)
{
    ctrl_input_t out;
    out.armed    = (p->flags & 0x01) != 0;
    out.throttle = (float)p->throttle / 1000.0f;
    out.roll     = (float)p->roll  / 500.0f;
    out.pitch    = (float)p->pitch / 500.0f;
    out.yaw      = (float)p->yaw   / 500.0f;
    out.seq      = p->seq;
    out.ts_us    = esp_timer_get_time();

    /* Clamp -- never trust the wire. */
    if (out.throttle < 0.0f) out.throttle = 0.0f;
    if (out.throttle > 1.0f) out.throttle = 1.0f;
    if (out.roll  < -1.0f) out.roll  = -1.0f; if (out.roll  > 1.0f) out.roll  = 1.0f;
    if (out.pitch < -1.0f) out.pitch = -1.0f; if (out.pitch > 1.0f) out.pitch = 1.0f;
    if (out.yaw   < -1.0f) out.yaw   = -1.0f; if (out.yaw   > 1.0f) out.yaw   = 1.0f;

    xSemaphoreTake(s_lock, portMAX_DELAY);
    s_latest = out;
    xSemaphoreGive(s_lock);
}

static void rx_task(void *arg)
{
    (void)arg;
    s_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s_sock < 0) {
        ESP_LOGE(TAG, "socket() failed");
        vTaskDelete(NULL);
        return;
    }

    struct sockaddr_in bind_addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons(CTRL_UDP_PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(s_sock, (struct sockaddr *)&bind_addr, sizeof(bind_addr)) < 0) {
        ESP_LOGE(TAG, "bind() failed");
        close(s_sock); s_sock = -1;
        vTaskDelete(NULL);
        return;
    }
    ESP_LOGI(TAG, "control UDP listening on :%d", CTRL_UDP_PORT);

    for (;;) {
        ctrl_pkt_t pkt;
        struct sockaddr_in src;
        socklen_t srclen = sizeof(src);
        int n = recvfrom(s_sock, &pkt, sizeof(pkt), 0,
                         (struct sockaddr *)&src, &srclen);
        if (n == (int)sizeof(pkt) && packet_valid(&pkt)) {
            parse_packet(&pkt);
            xSemaphoreTake(s_lock, portMAX_DELAY);
            s_peer      = src;
            s_have_peer = true;
            xSemaphoreGive(s_lock);
        }
    }
}

static void on_wifi_event(void *arg, esp_event_base_t base,
                          int32_t id, void *data)
{
    (void)arg; (void)base; (void)data;
    if (id == WIFI_EVENT_AP_STACONNECTED)      ESP_LOGI(TAG, "client connected");
    else if (id == WIFI_EVENT_AP_STADISCONNECTED) ESP_LOGI(TAG, "client gone");
}

esp_err_t wifi_link_init(void)
{
    s_lock = xSemaphoreCreateMutex();
    memset(&s_latest, 0, sizeof(s_latest));

    /* NVS first -- WiFi calibration data lives there. */
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        err = nvs_flash_init();
    }
    if (err != ESP_OK) return err;

    err = esp_netif_init();                 if (err != ESP_OK) return err;
    err = esp_event_loop_create_default();  if (err != ESP_OK) return err;
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&cfg); if (err != ESP_OK) return err;

    err = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                     on_wifi_event, NULL);
    if (err != ESP_OK) return err;

    wifi_config_t wc = {
        .ap = {
            .ssid           = WIFI_AP_SSID,
            .ssid_len       = sizeof(WIFI_AP_SSID) - 1,
            .channel        = WIFI_AP_CHANNEL,
            .password       = WIFI_AP_PASSWORD,
            .max_connection = WIFI_AP_MAX_CONN,
            .authmode       = WIFI_AUTH_WPA2_PSK,
        },
    };
    err = esp_wifi_set_mode(WIFI_MODE_AP);          if (err != ESP_OK) return err;
    err = esp_wifi_set_config(WIFI_IF_AP, &wc);     if (err != ESP_OK) return err;
    err = esp_wifi_start();                          if (err != ESP_OK) return err;

    esp_wifi_set_ps(WIFI_PS_NONE);

    BaseType_t ok = xTaskCreate(rx_task, "wifi_rx", 4096, NULL, 5, NULL);
    return ok == pdPASS ? ESP_OK : ESP_FAIL;
}

void wifi_link_get_latest(ctrl_input_t *out)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
    *out = s_latest;
    xSemaphoreGive(s_lock);
}

bool wifi_link_is_alive(void)
{
    int64_t now = esp_timer_get_time();
    int64_t ts;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    ts = s_latest.ts_us;
    xSemaphoreGive(s_lock);
    if (ts == 0) return false;
    return (now - ts) < (int64_t)CTRL_TIMEOUT_MS * 1000;
}

void wifi_link_send_telemetry(float roll_deg, float pitch_deg, float yaw_deg,
                              float throttle, bool armed, uint32_t loop_us)
{
    if (s_sock < 0 || !s_have_peer) return;

    telem_pkt_t pkt = {
        .magic       = { 'D', 'T' },
        .version     = 1,
        .armed       = armed ? 1 : 0,
        .roll_cdeg   = (int16_t)(roll_deg  * 100.0f),
        .pitch_cdeg  = (int16_t)(pitch_deg * 100.0f),
        .yaw_cdeg    = (int16_t)(yaw_deg   * 100.0f),
        .throttle_pm = (uint16_t)(throttle * 1000.0f),
        .loop_us     = loop_us,
    };
    struct sockaddr_in dst;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    dst = s_peer;
    xSemaphoreGive(s_lock);
    dst.sin_port = htons(TELEM_UDP_PORT);

    /* Best-effort; drops are fine. */
    sendto(s_sock, &pkt, sizeof(pkt), 0,
           (struct sockaddr *)&dst, sizeof(dst));
}
