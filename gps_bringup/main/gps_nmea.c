#include "gps_nmea.h"
#include "board_config.h"

#include "driver/uart.h"
#include "esp_log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *TAG = "gps_nmea";

static gps_fix_t s_fix;
static uint32_t s_rx_bytes_total;
static uint32_t s_gga_parsed_count;
static bool s_logged_first_rx_preview;
static uint32_t s_gga_raw_log_mod = 50;

static void log_rx_preview_once(const uint8_t *buf, int len)
{
    if (s_logged_first_rx_preview || !buf || len <= 0) {
        return;
    }

    char hex[3 * 32 + 1] = {0};
    char ascii[32 + 1] = {0};
    int preview_len = (len < 32) ? len : 32;
    int hex_idx = 0;

    for (int i = 0; i < preview_len; i++) {
        uint8_t b = buf[i];
        hex_idx += snprintf(&hex[hex_idx], sizeof(hex) - (size_t)hex_idx,
                            "%02X%s", b, (i == preview_len - 1) ? "" : " ");
        ascii[i] = (b >= 32 && b <= 126) ? (char)b : '.';
    }
    ascii[preview_len] = '\0';

    ESP_LOGI(TAG, "First RX preview (%d bytes): HEX[%s] ASCII[%s]", preview_len, hex, ascii);
    s_logged_first_rx_preview = true;
}

static double nmea_to_decimal_degrees(const char *value, char hemi)
{
    if (!value || value[0] == '\0') {
        return 0.0;
    }
    double raw = atof(value);
    int deg = (int)(raw / 100.0);
    double minutes = raw - (double)(deg * 100);
    double dec = (double)deg + (minutes / 60.0);
    if (hemi == 'S' || hemi == 'W') {
        dec = -dec;
    }
    return dec;
}

static void parse_gga(char *sentence)
{
    int field = 0;
    char *save = NULL;
    char *tok = strtok_r(sentence, ",", &save);

    char lat[16] = {0};
    char lon[16] = {0};
    char lat_h = 'N';
    char lon_h = 'E';
    int fix_quality = 0;
    int sats = 0;
    float hdop = 99.9f;

    while (tok) {
        switch (field) {
            case 2: strncpy(lat, tok, sizeof(lat) - 1); break;
            case 3: if (tok[0]) lat_h = tok[0]; break;
            case 4: strncpy(lon, tok, sizeof(lon) - 1); break;
            case 5: if (tok[0]) lon_h = tok[0]; break;
            case 6: fix_quality = atoi(tok); break;
            case 7: sats = atoi(tok); break;
            case 8: hdop = strtof(tok, NULL); break;
            default: break;
        }
        tok = strtok_r(NULL, ",", &save);
        field++;
    }

    s_fix.fix_quality = fix_quality;
    s_fix.satellites = sats;
    s_fix.hdop = hdop;

    if (fix_quality > 0 && lat[0] && lon[0]) {
        s_fix.lat_deg = nmea_to_decimal_degrees(lat, lat_h);
        s_fix.lon_deg = nmea_to_decimal_degrees(lon, lon_h);
        s_fix.valid = true;
    } else {
        s_fix.valid = false;
    }
}

void gps_uart_init(void)
{
    const uart_config_t cfg = {
        .baud_rate = GPS_UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(GPS_UART_NUM, 4096, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(GPS_UART_NUM, &cfg));
    ESP_ERROR_CHECK(uart_set_pin(GPS_UART_NUM, GPS_UART_TX_PIN, GPS_UART_RX_PIN,
                                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    memset(&s_fix, 0, sizeof(s_fix));
    ESP_LOGI(TAG, "UART%d RX=%d TX=%d baud=%d", (int)GPS_UART_NUM,
             (int)GPS_UART_RX_PIN, (int)GPS_UART_TX_PIN, GPS_UART_BAUD);
}

void gps_uart_poll(void)
{
    uint8_t buf[256];
    int n = uart_read_bytes(GPS_UART_NUM, buf, sizeof(buf), 0);
    if (n <= 0) {
        return;
    }
    log_rx_preview_once(buf, n);
    s_rx_bytes_total += (uint32_t)n;

    static char line[160];
    static size_t idx = 0;

    for (int i = 0; i < n; i++) {
        char c = (char)buf[i];
        if (c == '\n' || c == '\r') {
            if (idx > 6) {
                line[idx] = '\0';
                if (strncmp(line, "$GNGGA", 6) == 0 || strncmp(line, "$GPGGA", 6) == 0) {
                    char gga_raw[sizeof(line)];
                    strncpy(gga_raw, line, sizeof(gga_raw) - 1);
                    gga_raw[sizeof(gga_raw) - 1] = '\0';

                    parse_gga(line);
                    s_gga_parsed_count++;
                    if (s_gga_raw_log_mod > 0 && (s_gga_parsed_count % s_gga_raw_log_mod) == 0) {
                        ESP_LOGI(TAG, "Raw GGA #%lu: %s",
                                 (unsigned long)s_gga_parsed_count, gga_raw);
                    }
                }
            }
            idx = 0;
            line[0] = '\0';
        } else if (idx < sizeof(line) - 1) {
            line[idx++] = c;
        } else {
            idx = 0;
        }
    }
}

void gps_get_fix(gps_fix_t *out)
{
    if (out) {
        *out = s_fix;
    }
}

void gps_get_stats(gps_stats_t *out)
{
    if (out) {
        out->rx_bytes_total = s_rx_bytes_total;
        out->gga_parsed_count = s_gga_parsed_count;
    }
}
