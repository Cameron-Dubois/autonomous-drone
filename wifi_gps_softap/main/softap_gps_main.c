/*
 * Merged firmware: Wi-Fi SoftAP + HTTP (port 80) + WebSocket telemetry (port 81).
 * JSON lines match mobile parseBleTelemetryPayload: droneLat, droneLon, droneGpsValid,
 * droneHeadingDeg, etc. See mobile/src/stream/droneStream.ts (ws://192.168.4.1:81/ws).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "board_config.h"
#include "compass_mag.h"
#include "gps_nmea.h"

#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "lwip/err.h"
#include "lwip/sys.h"

#define EXAMPLE_ESP_WIFI_SSID    CONFIG_ESP_WIFI_SSID
#define EXAMPLE_ESP_WIFI_PASS    CONFIG_ESP_WIFI_PASSWORD
#define EXAMPLE_ESP_WIFI_CHANNEL CONFIG_ESP_WIFI_CHANNEL
#define EXAMPLE_MAX_STA_CONN     CONFIG_ESP_MAX_STA_CONN

static const char *TAG = "wifi_gps";

static httpd_handle_t s_httpd = NULL;
static httpd_handle_t s_ws_httpd = NULL;

/** Active WebSocket client (last connect wins). Protected by s_ws_fd_mux. */
static int s_ws_client_fd = -1;
static portMUX_TYPE s_ws_fd_mux = portMUX_INITIALIZER_UNLOCKED;

static void ws_fd_set(int fd)
{
    portENTER_CRITICAL(&s_ws_fd_mux);
    s_ws_client_fd = fd;
    portEXIT_CRITICAL(&s_ws_fd_mux);
}

static int ws_fd_get(void)
{
    portENTER_CRITICAL(&s_ws_fd_mux);
    int fd = s_ws_client_fd;
    portEXIT_CRITICAL(&s_ws_fd_mux);
    return fd;
}

#define WS_TELEM_INTERVAL_MS 200

static esp_err_t ws_handler(httpd_req_t *req)
{
    if (req->method == HTTP_GET) {
        int fd = httpd_req_to_sockfd(req);
        ESP_LOGI(TAG, "WebSocket client connected fd=%d", fd);
        ws_fd_set(fd);
        return ESP_OK;
    }

    httpd_ws_frame_t ws_pkt = {0};
    esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
    if (ret != ESP_OK) {
        ESP_LOGD(TAG, "ws recv hdr failed: %s", esp_err_to_name(ret));
        ws_fd_set(-1);
        return ret;
    }

    if (ws_pkt.type == HTTPD_WS_TYPE_CLOSE) {
        ws_fd_set(-1);
        return ESP_OK;
    }

    uint8_t *payload = NULL;
    if (ws_pkt.len > 0) {
        payload = (uint8_t *)malloc(ws_pkt.len);
        if (!payload) {
            return ESP_ERR_NO_MEM;
        }
        ws_pkt.payload = payload;
        ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
        if (ret != ESP_OK) {
            free(payload);
            ws_fd_set(-1);
            return ret;
        }
    }

    if (ws_pkt.type == HTTPD_WS_TYPE_PING) {
        httpd_ws_frame_t pong = {
            .final = true,
            .type = HTTPD_WS_TYPE_PONG,
            .payload = payload,
            .len = ws_pkt.len,
        };
        ret = httpd_ws_send_frame(req, &pong);
        if (payload) {
            free(payload);
        }
        return ret;
    }

    /* TEXT / BINARY from phone (e.g. command frames); consumed, flight hookup TBD */
    if (payload) {
        free(payload);
    }
    return ESP_OK;
}

static void start_ws_server(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 81;
    /* Each httpd instance needs its own UDP ctrl socket port; default is ESP_HTTPD_DEF_CTRL_PORT. */
    config.ctrl_port = ESP_HTTPD_DEF_CTRL_PORT + 1;
    config.send_wait_timeout = 30;
    config.recv_wait_timeout = 30;

    if (httpd_start(&s_ws_httpd, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start WebSocket HTTP server on :81");
        return;
    }

    httpd_uri_t ws = {
        .uri = "/ws",
        .method = HTTP_GET,
        .handler = ws_handler,
        .user_ctx = NULL,
        .is_websocket = true,
    };

    if (httpd_register_uri_handler(s_ws_httpd, &ws) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to register /ws");
        httpd_stop(s_ws_httpd);
        s_ws_httpd = NULL;
        return;
    }

    ESP_LOGI(TAG, "WebSocket ws://192.168.4.1:81/ws");
}

static void ws_push_telemetry(const gps_fix_t *fix, bool compass_ok, float heading_deg)
{
    if (!s_ws_httpd) {
        return;
    }

    int fd = ws_fd_get();
    if (fd < 0) {
        return;
    }

    if (httpd_ws_get_fd_info(s_ws_httpd, fd) != HTTPD_WS_CLIENT_WEBSOCKET) {
        ws_fd_set(-1);
        return;
    }

    char hdg_part[24];
    if (compass_ok) {
        snprintf(hdg_part, sizeof(hdg_part), "%.1f", (double)heading_deg);
    } else {
        memcpy(hdg_part, "null", 5);
    }

    char buf[384];
    int n;

    if (fix->valid) {
        n = snprintf(buf, sizeof(buf),
                     "{\"droneGpsValid\":true,\"droneLat\":%.7f,\"droneLon\":%.7f,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":%.1f,"
                     "\"droneHeadingDeg\":%s}",
                     fix->lat_deg, fix->lon_deg, fix->fix_quality, fix->satellites, (double)fix->hdop,
                     hdg_part);
    } else {
        n = snprintf(buf, sizeof(buf),
                     "{\"droneGpsValid\":false,\"droneLat\":null,\"droneLon\":null,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":null,"
                     "\"droneHeadingDeg\":%s}",
                     fix->fix_quality, fix->satellites, hdg_part);
    }

    if (n <= 0 || n >= (int)sizeof(buf)) {
        return;
    }

    httpd_ws_frame_t out = {
        .final = true,
        .type = HTTPD_WS_TYPE_TEXT,
        .payload = (uint8_t *)buf,
        .len = (size_t)n,
    };

    esp_err_t err = httpd_ws_send_data(s_ws_httpd, fd, &out);
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "ws telemetry send: %s", esp_err_to_name(err));
        ws_fd_set(-1);
    }
}

static esp_err_t root_handler(httpd_req_t *req)
{
    const char *resp = "ESP32-C3 Wi-Fi + GPS bring-up alive";
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_send(req, resp, HTTPD_RESP_USE_STRLEN);
}

#define STREAM_TICK_MS    200
#define STREAM_CHUNK_SIZE 32

static esp_err_t stream_handler(httpd_req_t *req)
{
    char chunk[STREAM_CHUNK_SIZE];
    uint32_t tick = 0;

    httpd_resp_set_type(req, "text/plain");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    httpd_resp_set_hdr(req, "X-Accel-Buffering", "no");

    while (1) {
        int len = snprintf(chunk, sizeof(chunk), "tick=%lu\n", (unsigned long)tick);
        if (len <= 0 || (size_t)len >= sizeof(chunk)) {
            break;
        }
        esp_err_t ret = httpd_resp_send_chunk(req, chunk, (ssize_t)len);
        if (ret != ESP_OK) {
            break;
        }
        tick++;
        vTaskDelay(pdMS_TO_TICKS(STREAM_TICK_MS));
    }

    httpd_resp_send_chunk(req, NULL, 0);
    return ESP_OK;
}

/** One-shot JSON for phone browser testing (same field names as WebSocket telemetry). */
static esp_err_t gps_json_handler(httpd_req_t *req)
{
    gps_uart_poll();

    gps_fix_t fix;
    gps_get_fix(&fix);
    float heading = 0.0f;
    bool compass_ok = compass_read_heading_deg(&heading);

    char hdg_part[24];
    if (compass_ok) {
        snprintf(hdg_part, sizeof(hdg_part), "%.1f", (double)heading);
    } else {
        memcpy(hdg_part, "null", 5);
    }

    char buf[512];
    int n;
    if (fix.valid) {
        n = snprintf(buf, sizeof(buf),
                     "{\"droneGpsValid\":true,\"droneLat\":%.7f,\"droneLon\":%.7f,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":%.1f,"
                     "\"droneHeadingDeg\":%s}",
                     fix.lat_deg, fix.lon_deg, fix.fix_quality, fix.satellites, (double)fix.hdop, hdg_part);
    } else {
        n = snprintf(buf, sizeof(buf),
                     "{\"droneGpsValid\":false,\"droneLat\":null,\"droneLon\":null,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":null,"
                     "\"droneHeadingDeg\":%s}",
                     fix.fix_quality, fix.satellites, hdg_part);
    }

    if (n <= 0 || n >= (int)sizeof(buf)) {
        httpd_resp_set_status(req, "500 Internal Server Error");
        httpd_resp_set_type(req, "application/json");
        return httpd_resp_send(req, "{}", HTTPD_RESP_USE_STRLEN);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t *event = (wifi_event_ap_staconnected_t *)event_data;
        ESP_LOGI(TAG, "station " MACSTR " join, AID=%d", MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t *event = (wifi_event_ap_stadisconnected_t *)event_data;
        ESP_LOGI(TAG, "station " MACSTR " leave, AID=%d, reason=%d",
                 MAC2STR(event->mac), event->aid, event->reason);
    }
}

static void wifi_init_softap(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = EXAMPLE_ESP_WIFI_SSID,
            .ssid_len = strlen(EXAMPLE_ESP_WIFI_SSID),
            .channel = EXAMPLE_ESP_WIFI_CHANNEL,
            .password = EXAMPLE_ESP_WIFI_PASS,
            .max_connection = EXAMPLE_MAX_STA_CONN,
#ifdef CONFIG_ESP_WIFI_SOFTAP_SAE_SUPPORT
            .authmode = WIFI_AUTH_WPA3_PSK,
            .sae_pwe_h2e = WPA3_SAE_PWE_BOTH,
#else
            .authmode = WIFI_AUTH_WPA2_PSK,
#endif
            .pmf_cfg = {
                .required = true,
            },
#ifdef CONFIG_ESP_WIFI_BSS_MAX_IDLE_SUPPORT
            .bss_max_idle_cfg = {
                .period = WIFI_AP_DEFAULT_MAX_IDLE_PERIOD,
                .protected_keep_alive = 1,
            },
#endif
        },
    };
    if (strlen(EXAMPLE_ESP_WIFI_PASS) == 0) {
        wifi_config.ap.authmode = WIFI_AUTH_OPEN;
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "SoftAP SSID:%s channel:%d", EXAMPLE_ESP_WIFI_SSID, EXAMPLE_ESP_WIFI_CHANNEL);
}

static void start_http_server(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    config.send_wait_timeout = 30;
    config.recv_wait_timeout = 10;

    if (httpd_start(&s_httpd, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server");
        return;
    }

    httpd_uri_t root = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = root_handler,
        .user_ctx = NULL,
    };
    httpd_uri_t stream = {
        .uri = "/stream",
        .method = HTTP_GET,
        .handler = stream_handler,
        .user_ctx = NULL,
    };
    httpd_uri_t gps_json = {
        .uri = "/gps",
        .method = HTTP_GET,
        .handler = gps_json_handler,
        .user_ctx = NULL,
    };

    if (httpd_register_uri_handler(s_httpd, &root) != ESP_OK ||
        httpd_register_uri_handler(s_httpd, &stream) != ESP_OK ||
        httpd_register_uri_handler(s_httpd, &gps_json) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to register URI handlers");
        httpd_stop(s_httpd);
        s_httpd = NULL;
        return;
    }

    ESP_LOGI(TAG, "HTTP http://192.168.4.1/  /stream  /gps (JSON)");
}

static void sensor_task(void *arg)
{
    (void)arg;
    TickType_t last_log = xTaskGetTickCount();
    TickType_t last_ws = last_log;
    uint32_t prev_rx_total = 0;

    while (1) {
        gps_uart_poll();

        TickType_t now = xTaskGetTickCount();

        if ((now - last_ws) >= pdMS_TO_TICKS(WS_TELEM_INTERVAL_MS)) {
            gps_fix_t fix_ws;
            gps_get_fix(&fix_ws);
            float heading_ws = 0.0f;
            bool compass_ok_ws = compass_read_heading_deg(&heading_ws);
            ws_push_telemetry(&fix_ws, compass_ok_ws, heading_ws);
            last_ws = now;
        }

        if ((now - last_log) >= pdMS_TO_TICKS(1000)) {
            gps_fix_t fix;
            gps_get_fix(&fix);

            gps_stats_t st;
            gps_get_stats(&st);
            uint32_t rx_per_sec = st.rx_bytes_total - prev_rx_total;
            prev_rx_total = st.rx_bytes_total;

            float heading = 0.0f;
            bool compass_ok = compass_read_heading_deg(&heading);
            compass_debug_t cdbg = {0};
            bool cdbg_ok = compass_get_debug(&cdbg);

            const char *ctype = "NONE";
            switch (compass_get_type()) {
            case COMPASS_TYPE_QMC5883:
                ctype = "QMC5883";
                break;
            case COMPASS_TYPE_HMC5883L:
                ctype = "HMC5883L";
                break;
            default:
                break;
            }

            if (cdbg_ok) {
                int dx = (int)cdbg.x_max - (int)cdbg.x_min;
                int dy = (int)cdbg.y_max - (int)cdbg.y_min;
                const char *cal_quality = ((dx >= 300) && (dy >= 300)) ? "GOOD"
                    : ((dx >= 120) && (dy >= 120))                      ? "PARTIAL"
                                                                        : "POOR";
                ESP_LOGI(TAG,
                         "GPS valid=%d fix=%d sats=%d hdop=%.1f lat=%.6f lon=%.6f | "
                         "uart_rx_B/s=%lu gga_cnt=%lu | compass=%s %s heading=%.1f raw=%.1f cal=%.1f "
                         "x=%d y=%d x[%d..%d] y[%d..%d] dx=%d dy=%d cal_ok=%d cal_q=%s",
                         fix.valid, fix.fix_quality, fix.satellites, fix.hdop, fix.lat_deg, fix.lon_deg,
                         (unsigned long)rx_per_sec, (unsigned long)st.gga_parsed_count, ctype,
                         compass_ok ? "OK" : "WAIT", heading, cdbg.heading_raw_deg, cdbg.heading_cal_deg,
                         (int)cdbg.x_raw, (int)cdbg.y_raw, (int)cdbg.x_min, (int)cdbg.x_max,
                         (int)cdbg.y_min, (int)cdbg.y_max, dx, dy, cdbg.calibrated ? 1 : 0, cal_quality);
            } else {
                ESP_LOGI(TAG,
                         "GPS valid=%d fix=%d sats=%d hdop=%.1f lat=%.6f lon=%.6f | "
                         "uart_rx_B/s=%lu gga_cnt=%lu | compass=%s %s heading=%.1f deg",
                         fix.valid, fix.fix_quality, fix.satellites, fix.hdop, fix.lat_deg, fix.lon_deg,
                         (unsigned long)rx_per_sec, (unsigned long)st.gga_parsed_count, ctype,
                         compass_ok ? "OK" : "WAIT", heading);
            }
            last_log = now;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "SoftAP + GPS + compass + WebSocket telemetry");

    wifi_init_softap();
    start_http_server();
    start_ws_server();

    gps_uart_init();
    esp_err_t cerr = compass_init();
    if (cerr != ESP_OK) {
        ESP_LOGW(TAG, "Compass init failed (%s) — GPS-only; check SDA/SCL",
                 esp_err_to_name(cerr));
    } else {
        compass_reset_calibration();
    }

    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
}
