#pragma once

#include "esp_log.h"

/** ANSI bright blue (body text; ESP-IDF still prefixes the green timestamp/tag). */
#define CONN_BANNER_BLUE "\033[1;34m"
#define CONN_BANNER_RESET "\033[0m"

static const char *const CONN_BANNER_TAG = "CONNECT";

static inline void log_wifi_connected_banner(void)
{
    ESP_LOGI(CONN_BANNER_TAG,
             "\n" CONN_BANNER_BLUE
             "========================================\n"
             "          WIFI CONNECTED\n"
             "========================================\n" CONN_BANNER_RESET);
}

static inline void log_ble_connected_banner(void)
{
    ESP_LOGI(CONN_BANNER_TAG,
             "\n" CONN_BANNER_BLUE
             "========================================\n"
             "           BLE CONNECTED\n"
             "========================================\n" CONN_BANNER_RESET);
}

/** Forget last command so the next one prints a banner again (e.g. BLE disconnect). */
void drone_command_banner_reset(void);

/** Print a blue COMMAND banner for nav intents only (FORWARD, ROTATE, RETREAT, HOLD, IDLE). */
void drone_command_banner_if_changed(uint8_t cmd);
