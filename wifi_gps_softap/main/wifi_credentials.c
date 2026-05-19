#include "wifi_credentials.h"

#include <string.h>

#include "nvs.h"
#include "sdkconfig.h"

#define NVS_NAMESPACE "wifi_cred"
#define NVS_KEY_PROV  "prov"
#define NVS_KEY_PWD   "pwd"

bool wifi_credentials_is_valid_password(const char *pwd)
{
    if (pwd == NULL) {
        return false;
    }
    size_t len = strlen(pwd);
    return len >= WIFI_CRED_PWD_MIN_LEN && len <= WIFI_CRED_PWD_MAX_LEN;
}

static esp_err_t open_nvs(nvs_handle_t *out, nvs_open_mode_t mode)
{
    return nvs_open(NVS_NAMESPACE, mode, out);
}

bool wifi_credentials_is_provisioned(void)
{
    nvs_handle_t h;
    esp_err_t err = open_nvs(&h, NVS_READONLY);
    if (err != ESP_OK) {
        return false;
    }
    uint8_t prov = 0;
    err = nvs_get_u8(h, NVS_KEY_PROV, &prov);
    nvs_close(h);
    return err == ESP_OK && prov == 1;
}

esp_err_t wifi_credentials_get_password(char *buf, size_t len)
{
    if (buf == NULL || len < 2) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t h;
    esp_err_t err = open_nvs(&h, NVS_READONLY);
    if (err != ESP_OK) {
        strncpy(buf, CONFIG_ESP_WIFI_PASSWORD, len - 1);
        buf[len - 1] = '\0';
        return ESP_OK;
    }

    uint8_t prov = 0;
    err = nvs_get_u8(h, NVS_KEY_PROV, &prov);
    if (err == ESP_OK && prov == 1) {
        size_t pwd_len = len;
        err = nvs_get_str(h, NVS_KEY_PWD, buf, &pwd_len);
        nvs_close(h);
        if (err == ESP_OK) {
            return ESP_OK;
        }
    }
    nvs_close(h);

    strncpy(buf, CONFIG_ESP_WIFI_PASSWORD, len - 1);
    buf[len - 1] = '\0';
    return ESP_OK;
}

esp_err_t wifi_credentials_set_password(const char *pwd)
{
    if (!wifi_credentials_is_valid_password(pwd)) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t h;
    esp_err_t err = open_nvs(&h, NVS_READWRITE);
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_str(h, NVS_KEY_PWD, pwd);
    if (err == ESP_OK) {
        err = nvs_set_u8(h, NVS_KEY_PROV, 1);
    }
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    return err;
}

esp_err_t wifi_credentials_factory_reset(void)
{
    nvs_handle_t h;
    esp_err_t err = open_nvs(&h, NVS_READWRITE);
    if (err != ESP_OK) {
        return err;
    }

    (void)nvs_erase_key(h, NVS_KEY_PWD);
    (void)nvs_erase_key(h, NVS_KEY_PROV);
    err = nvs_commit(h);
    nvs_close(h);
    return err;
}

const char *wifi_credentials_get_ssid(void)
{
    return CONFIG_ESP_WIFI_SSID;
}
