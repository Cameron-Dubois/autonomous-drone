#include "wifi_softap.h"

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "wifi_credentials.h"

static const char *TAG = "wifi_softap";

#define WIFI_CHANNEL CONFIG_ESP_WIFI_CHANNEL
#define WIFI_MAX_CONN CONFIG_ESP_MAX_STA_CONN

static bool s_wifi_started = false;

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

static void build_ap_config(wifi_config_t *wifi_config, const char *password)
{
    memset(wifi_config, 0, sizeof(*wifi_config));
    const char *ssid = wifi_credentials_get_ssid();
    strncpy((char *)wifi_config->ap.ssid, ssid, sizeof(wifi_config->ap.ssid) - 1);
    wifi_config->ap.ssid_len = strlen(ssid);
    wifi_config->ap.channel = WIFI_CHANNEL;
    wifi_config->ap.max_connection = WIFI_MAX_CONN;

    if (password != NULL && password[0] != '\0') {
        strncpy((char *)wifi_config->ap.password, password, sizeof(wifi_config->ap.password) - 1);
#ifdef CONFIG_ESP_WIFI_SOFTAP_SAE_SUPPORT
        wifi_config->ap.authmode = WIFI_AUTH_WPA3_PSK;
        wifi_config->ap.sae_pwe_h2e = WPA3_SAE_PWE_BOTH;
#else
        wifi_config->ap.authmode = WIFI_AUTH_WPA2_PSK;
#endif
        wifi_config->ap.pmf_cfg.required = true;
    } else {
        wifi_config->ap.authmode = WIFI_AUTH_OPEN;
    }
}

static esp_err_t apply_config_and_start(const char *password)
{
    wifi_config_t wifi_config;
    build_ap_config(&wifi_config, password);

    esp_err_t err = esp_wifi_set_config(WIFI_IF_AP, &wifi_config);
    if (err != ESP_OK) {
        return err;
    }

    if (!s_wifi_started) {
        err = esp_wifi_start();
        if (err == ESP_OK) {
            s_wifi_started = true;
        }
        return err;
    }

    err = esp_wifi_stop();
    if (err != ESP_OK) {
        return err;
    }
    s_wifi_started = false;

    err = esp_wifi_set_config(WIFI_IF_AP, &wifi_config);
    if (err != ESP_OK) {
        return err;
    }

    err = esp_wifi_start();
    if (err == ESP_OK) {
        s_wifi_started = true;
    }
    return err;
}

void wifi_softap_init(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler, NULL, NULL));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));

    char password[WIFI_CRED_PWD_MAX_LEN + 1];
    ESP_ERROR_CHECK(wifi_credentials_get_password(password, sizeof(password)));
    ESP_ERROR_CHECK(apply_config_and_start(password));

    ESP_LOGI(TAG, "SoftAP SSID:%s channel:%d provisioned:%d",
             wifi_credentials_get_ssid(), WIFI_CHANNEL, wifi_credentials_is_provisioned() ? 1 : 0);
}

esp_err_t wifi_softap_apply_password(const char *password)
{
    if (password == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (password[0] != '\0' && !wifi_credentials_is_valid_password(password)) {
        return ESP_ERR_INVALID_ARG;
    }
    return apply_config_and_start(password);
}
