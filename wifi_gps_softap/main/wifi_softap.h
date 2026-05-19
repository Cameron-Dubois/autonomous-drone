#pragma once

#include "esp_err.h"

/** Initialize netif, Wi-Fi driver, and start SoftAP using NVS or factory password. */
void wifi_softap_init(void);

/**
 * Restart SoftAP with a new password (disconnects all stations).
 * Does not write NVS; caller must persist first if needed.
 */
esp_err_t wifi_softap_apply_password(const char *password);
