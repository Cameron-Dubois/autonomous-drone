/*
 * Merged firmware: Wi-Fi SoftAP + HTTPS (port 443) + secure WebSocket telemetry.
 * JSON lines match mobile parseBleTelemetryPayload: droneLat, droneLon, droneGpsValid,
 * droneHeadingDeg, etc. TLS uses an embedded self-signed certificate.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "board_config.h"
#include "bmp280_baro.h"
#include "compass_mag.h"
#include "gps_nmea.h"
#include "bleprph.h"
#include "wifi_gps_ble.h"
#include "motor.h"

#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_https_server.h"
#include "esp_log.h"
#include "wifi_provision_http.h"
#include "wifi_softap.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "lwip/err.h"
#include "lwip/sys.h"

static const char *TAG = "wifi_gps";

static httpd_handle_t s_httpd = NULL;

extern const unsigned char servercert_pem_start[] asm("_binary_servercert_pem_start");
extern const unsigned char servercert_pem_end[] asm("_binary_servercert_pem_end");
extern const unsigned char prvkey_pem_start[] asm("_binary_prvkey_pem_start");
extern const unsigned char prvkey_pem_end[] asm("_binary_prvkey_pem_end");

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

/** Build one-line JSON telemetry (same schema as /gps and WSS). Returns written length or -1. */
static int build_gps_telem_json(char *buf, size_t buf_sz, const gps_fix_t *fix, bool compass_ok, float heading_deg,
                                bool baro_ok, float baro_alt_m)
{
    char hdg_part[24];
    char rose_json[20];
    if (compass_ok) {
        snprintf(hdg_part, sizeof(hdg_part), "%.1f", (double)heading_deg);
        char rose[8];
        compass_format_cardinal(heading_deg, rose, sizeof(rose));
        snprintf(rose_json, sizeof(rose_json), "\"%s\"", rose);
    } else {
        memcpy(hdg_part, "null", 5);
        memcpy(rose_json, "null", 5);
    }

    char alt_part[24];
    if (baro_ok) {
        snprintf(alt_part, sizeof(alt_part), "%d", (int)lroundf(baro_alt_m));
    } else {
        memcpy(alt_part, "null", 5);
    }
    const char *baro_ok_part = baro_ok ? "true" : "false";

    int n;
    if (fix->valid) {
        n = snprintf(buf, buf_sz,
                     "{\"droneGpsValid\":true,\"droneLat\":%.7f,\"droneLon\":%.7f,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":%.1f,"
                     "\"droneHeadingDeg\":%s,\"droneHeadingRose\":%s,\"altM\":%s,\"droneBaroOk\":%s}",
                     fix->lat_deg, fix->lon_deg, fix->fix_quality, fix->satellites, (double)fix->hdop,
                     hdg_part, rose_json, alt_part, baro_ok_part);
    } else {
        n = snprintf(buf, buf_sz,
                     "{\"droneGpsValid\":false,\"droneLat\":null,\"droneLon\":null,"
                     "\"droneGpsFixQuality\":%d,\"droneGpsSatellites\":%d,\"droneGpsHdop\":null,"
                     "\"droneHeadingDeg\":%s,\"droneHeadingRose\":%s,\"altM\":%s,\"droneBaroOk\":%s}",
                     fix->fix_quality, fix->satellites, hdg_part, rose_json, alt_part, baro_ok_part);
    }

    if (n <= 0 || (size_t)n >= buf_sz) {
        return -1;
    }
    return n;
}

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

static void ws_push_telemetry(const gps_fix_t *fix, bool compass_ok, float heading_deg,
                              bool baro_ok, float baro_alt_m)
{
    char buf[448];
    int n = build_gps_telem_json(buf, sizeof(buf), fix, compass_ok, heading_deg, baro_ok, baro_alt_m);
    if (n < 0) {
        return;
    }

    if (s_httpd) {
        int fd = ws_fd_get();
        if (fd >= 0 && httpd_ws_get_fd_info(s_httpd, fd) == HTTPD_WS_CLIENT_WEBSOCKET) {
            httpd_ws_frame_t out = {
                .final = true,
                .type = HTTPD_WS_TYPE_TEXT,
                .payload = (uint8_t *)buf,
                .len = (size_t)n,
            };

            esp_err_t err = httpd_ws_send_data(s_httpd, fd, &out);
            if (err != ESP_OK) {
                ESP_LOGD(TAG, "ws telemetry send: %s", esp_err_to_name(err));
                ws_fd_set(-1);
            }
        }
    }

    uint16_t ble_conn = wifi_gps_ble_active_conn_handle();
    if (ble_conn != BLE_HS_CONN_HANDLE_NONE) {
        int brc = gatt_svr_notify_telemetry_json_b64(ble_conn, buf);
        if (brc != 0) {
            ESP_LOGD(TAG, "ble telemetry notify rc=%d", brc);
        }
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
    float baro_alt = 0.0f;
    bool baro_ok = baro_read_relative_altitude_m(&baro_alt);

    char buf[512];
    int n = build_gps_telem_json(buf, sizeof(buf), &fix, compass_ok, heading, baro_ok, baro_alt);
    if (n < 0) {
        httpd_resp_set_status(req, "500 Internal Server Error");
        httpd_resp_set_type(req, "application/json");
        return httpd_resp_send(req, "{}", HTTPD_RESP_USE_STRLEN);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

static void start_https_server(void)
{
    httpd_ssl_config_t ssl_config = HTTPD_SSL_CONFIG_DEFAULT();
    ssl_config.httpd.send_wait_timeout = 30;
    ssl_config.httpd.recv_wait_timeout = 10;
    ssl_config.httpd.lru_purge_enable = true;
    ssl_config.port_secure = 443;
    ssl_config.transport_mode = HTTPD_SSL_TRANSPORT_SECURE;
    ssl_config.servercert = servercert_pem_start;
    ssl_config.servercert_len = (size_t)(servercert_pem_end - servercert_pem_start);
    ssl_config.prvtkey_pem = prvkey_pem_start;
    ssl_config.prvtkey_len = (size_t)(prvkey_pem_end - prvkey_pem_start);

    if (httpd_ssl_start(&s_httpd, &ssl_config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTPS server on :443");
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
    httpd_uri_t ws = {
        .uri = "/ws",
        .method = HTTP_GET,
        .handler = ws_handler,
        .user_ctx = NULL,
        .is_websocket = true,
    };

    if (httpd_register_uri_handler(s_httpd, &root) != ESP_OK ||
        httpd_register_uri_handler(s_httpd, &stream) != ESP_OK ||
        httpd_register_uri_handler(s_httpd, &gps_json) != ESP_OK ||
        httpd_register_uri_handler(s_httpd, &ws) != ESP_OK ||
        wifi_provision_http_register(s_httpd) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to register URI handlers");
        httpd_ssl_stop(s_httpd);
        s_httpd = NULL;
        return;
    }

    ESP_LOGI(TAG, "HTTPS https://192.168.4.1/  /stream  /gps  /wifi/* (JSON)");
    ESP_LOGI(TAG, "Secure WebSocket wss://192.168.4.1/ws");
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
            float baro_alt_ws = 0.0f;
            bool baro_ok_ws = baro_read_relative_altitude_m(&baro_alt_ws);
            ws_push_telemetry(&fix_ws, compass_ok_ws, heading_ws, baro_ok_ws, baro_alt_ws);
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

            float baro_alt_log = 0.0f;
            bool baro_ok_log = baro_read_relative_altitude_m(&baro_alt_log);
            ESP_LOGI(TAG, "baro=%s alt=%.2f m (relative to boot baseline)",
                     baro_ok_log ? "OK" : (baro_is_ready() ? "WAIT" : "OFF"),
                     baro_ok_log ? (double)baro_alt_log : 0.0);

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

            char rose[8] = {0};
            compass_format_cardinal(heading, rose, sizeof(rose));

            if (cdbg_ok) {
                int dx = (int)cdbg.x_max - (int)cdbg.x_min;
                int dy = (int)cdbg.y_max - (int)cdbg.y_min;
                const char *cal_quality = ((dx >= 300) && (dy >= 300)) ? "GOOD"
                    : ((dx >= 120) && (dy >= 120))                      ? "PARTIAL"
                                                                        : "POOR";
                ESP_LOGI(TAG,
                         "GPS valid=%d fix=%d sats=%d hdop=%.1f lat=%.6f lon=%.6f | "
                         "uart_rx_B/s=%lu gga_cnt=%lu | compass=%s %s heading=%.1f° %s raw=%.1f cal=%.1f "
                         "x=%d y=%d x[%d..%d] y[%d..%d] dx=%d dy=%d cal_ok=%d cal_q=%s",
                         fix.valid, fix.fix_quality, fix.satellites, fix.hdop, fix.lat_deg, fix.lon_deg,
                         (unsigned long)rx_per_sec, (unsigned long)st.gga_parsed_count, ctype,
                         compass_ok ? "OK" : "WAIT", heading, rose, cdbg.heading_raw_deg, cdbg.heading_cal_deg,
                         (int)cdbg.x_raw, (int)cdbg.y_raw, (int)cdbg.x_min, (int)cdbg.x_max,
                         (int)cdbg.y_min, (int)cdbg.y_max, dx, dy, cdbg.calibrated ? 1 : 0, cal_quality);
            } else {
                ESP_LOGI(TAG,
                         "GPS valid=%d fix=%d sats=%d hdop=%.1f lat=%.6f lon=%.6f | "
                         "uart_rx_B/s=%lu gga_cnt=%lu | compass=%s %s heading=%.1f° %s",
                         fix.valid, fix.fix_quality, fix.satellites, fix.hdop, fix.lat_deg, fix.lon_deg,
                         (unsigned long)rx_per_sec, (unsigned long)st.gga_parsed_count, ctype,
                         compass_ok ? "OK" : "WAIT", heading, rose);
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

    ESP_LOGI(TAG, "SoftAP + GPS + compass + TLS + BLE (NimBLE)");

    wifi_softap_init();
    start_https_server();

    /* BLE before motors: DSHOT tick masks IRQs and starves NimBLE on ESP32-C3. */
    wifi_gps_ble_stack_start();

    /* Motors init deferred until DEMO_TAKEOFF / motors_runtime_prepare() — see motor_tick_task.c */

    gps_uart_init();
    esp_err_t cerr = compass_init();
    if (cerr != ESP_OK) {
        ESP_LOGW(TAG, "Compass init failed (%s) — GPS-only; check SDA/SCL",
                 esp_err_to_name(cerr));
    } else {
        compass_reset_calibration();
    }

    i2c_master_bus_handle_t i2c_bus = compass_get_i2c_bus();
    if (i2c_bus) {
        esp_err_t berr = baro_init(i2c_bus);
        if (berr != ESP_OK) {
            ESP_LOGW(TAG, "Barometer init failed (%s) — altitude unavailable; check wiring (SDO->GND for 0x76)",
                     esp_err_to_name(berr));
        }
    } else {
        ESP_LOGW(TAG, "I2C bus unavailable — barometer skipped");
    }

    xTaskCreate(sensor_task, "sensor", 4096, NULL, 5, NULL);
}
