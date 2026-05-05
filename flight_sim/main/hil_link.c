//hil_link.c
//binary protocol for hardware-in-the-loop testing
//uses the USB Serial/JTAG controller (the same port as idf.py monitor / COM5)
//NOT UART0 — on ESP32-C3 the USB connector goes through a separate peripheral

#include <string.h>
#include "hil_link.h"
#include "driver/usb_serial_jtag.h"
#include "esp_log.h"

static const char *TAG = "hil_link";

#define RX_BUF_SIZE  512
#define TX_BUF_SIZE  512

#define SENSOR_PAYLOAD_LEN  sizeof(hil_sensor_pkt_t)
#define MOTOR_PAYLOAD_LEN   sizeof(hil_motor_pkt_t)

static uint8_t calc_checksum(uint8_t type, const uint8_t *payload, size_t len)
{
    uint8_t cs = type;
    for (size_t i = 0; i < len; i++)
        cs ^= payload[i];
    return cs;
}

esp_err_t hil_link_init(void)
{
    usb_serial_jtag_driver_config_t cfg = {
        .rx_buffer_size = RX_BUF_SIZE,
        .tx_buffer_size = TX_BUF_SIZE,
    };

    esp_err_t ret = usb_serial_jtag_driver_install(&cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "USB Serial/JTAG driver install failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGW(TAG, "HIL link ready on USB Serial/JTAG");
    return ESP_OK;
}

esp_err_t hil_receive_sensors(hil_sensor_pkt_t *pkt, int timeout_ms)
{
    uint8_t byte;
    TickType_t ticks = pdMS_TO_TICKS(timeout_ms);

    //hunt for sync byte
    while (1) {
        int n = usb_serial_jtag_read_bytes(&byte, 1, ticks);
        if (n <= 0) return ESP_ERR_TIMEOUT;
        if (byte == HIL_SYNC_BYTE) break;
    }

    //read type byte
    if (usb_serial_jtag_read_bytes(&byte, 1, ticks) <= 0)
        return ESP_ERR_TIMEOUT;
    if (byte != HIL_TYPE_SENSOR)
        return ESP_ERR_INVALID_RESPONSE;

    //read payload
    uint8_t payload[SENSOR_PAYLOAD_LEN];
    int total = 0;
    while (total < (int)SENSOR_PAYLOAD_LEN) {
        int n = usb_serial_jtag_read_bytes(&payload[total],
                                           SENSOR_PAYLOAD_LEN - total, ticks);
        if (n <= 0) return ESP_ERR_TIMEOUT;
        total += n;
    }

    //read and verify checksum
    uint8_t cs_received;
    if (usb_serial_jtag_read_bytes(&cs_received, 1, ticks) <= 0)
        return ESP_ERR_TIMEOUT;

    uint8_t cs_expected = calc_checksum(HIL_TYPE_SENSOR, payload, SENSOR_PAYLOAD_LEN);
    if (cs_received != cs_expected)
        return ESP_ERR_INVALID_CRC;

    memcpy(pkt, payload, SENSOR_PAYLOAD_LEN);
    return ESP_OK;
}

esp_err_t hil_send_motors(const hil_motor_pkt_t *pkt)
{
    uint8_t buf[2 + MOTOR_PAYLOAD_LEN + 1];
    buf[0] = HIL_SYNC_BYTE;
    buf[1] = HIL_TYPE_MOTOR;
    memcpy(&buf[2], pkt, MOTOR_PAYLOAD_LEN);
    buf[2 + MOTOR_PAYLOAD_LEN] = calc_checksum(HIL_TYPE_MOTOR,
                                                (const uint8_t *)pkt,
                                                MOTOR_PAYLOAD_LEN);

    int written = usb_serial_jtag_write_bytes(buf, sizeof(buf), pdMS_TO_TICKS(100));
    return (written == sizeof(buf)) ? ESP_OK : ESP_FAIL;
}
