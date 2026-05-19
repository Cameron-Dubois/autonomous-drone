#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "esp_err.h"

/** WPA2-PSK password length limits. */
#define WIFI_CRED_PWD_MIN_LEN 8
#define WIFI_CRED_PWD_MAX_LEN 63

/** True when `pwd` is non-null and length is valid for WPA2. */
bool wifi_credentials_is_valid_password(const char *pwd);

/** True when a custom password was saved in NVS. */
bool wifi_credentials_is_provisioned(void);

/** Active AP password: NVS value if provisioned, else factory `CONFIG_ESP_WIFI_PASSWORD`. */
esp_err_t wifi_credentials_get_password(char *buf, size_t len);

/** Persist custom password and set provisioned flag. */
esp_err_t wifi_credentials_set_password(const char *pwd);

/** Clear NVS credentials; next boot uses factory password. */
esp_err_t wifi_credentials_factory_reset(void);

/** SoftAP SSID from menuconfig. */
const char *wifi_credentials_get_ssid(void);
