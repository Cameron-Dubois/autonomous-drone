#include "wifi_provision_http.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "esp_http_server.h"
#include "esp_log.h"
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wifi_credentials.h"
#include "wifi_softap.h"

static const char *TAG = "wifi_prov_http";

#define REQ_BODY_MAX 384

static esp_err_t read_request_body(httpd_req_t *req, char *buf, size_t buf_sz, size_t *out_len)
{
    if (buf_sz == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    size_t total = 0;
    while (total < buf_sz - 1) {
        int received = httpd_req_recv(req, buf + total, buf_sz - 1 - total);
        if (received < 0) {
            if (received == HTTPD_SOCK_ERR_TIMEOUT) {
                continue;
            }
            return ESP_FAIL;
        }
        if (received == 0) {
            break;
        }
        total += (size_t)received;
    }
    buf[total] = '\0';
    if (out_len) {
        *out_len = total;
    }
    return ESP_OK;
}

/** Extract a JSON string value for `"key":"value"` (no escape handling). */
static bool json_get_string(const char *json, const char *key, char *out, size_t out_len)
{
    if (json == NULL || key == NULL || out == NULL || out_len == 0) {
        return false;
    }

    char pattern[48];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *key_pos = strstr(json, pattern);
    if (key_pos == NULL) {
        return false;
    }

    const char *colon = strchr(key_pos + strlen(pattern), ':');
    if (colon == NULL) {
        return false;
    }

    const char *start = colon + 1;
    while (*start && isspace((unsigned char)*start)) {
        start++;
    }
    if (*start != '"') {
        return false;
    }
    start++;

    size_t i = 0;
    while (*start && *start != '"' && i + 1 < out_len) {
        out[i++] = *start++;
    }
    out[i] = '\0';
    return i > 0;
}

static esp_err_t send_json(httpd_req_t *req, const char *status, const char *body)
{
    httpd_resp_set_status(req, status);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t wifi_status_handler(httpd_req_t *req)
{
    if (req->method != HTTP_GET) {
        return send_json(req, "405 Method Not Allowed", "{\"ok\":false,\"error\":\"method\"}");
    }

    const bool prov = wifi_credentials_is_provisioned();
    char body[128];
    snprintf(body, sizeof(body),
             "{\"provisioned\":%s,\"ssid\":\"%s\"}",
             prov ? "true" : "false",
             wifi_credentials_get_ssid());
    return send_json(req, "200 OK", body);
}

static esp_err_t wifi_provision_handler(httpd_req_t *req)
{
    if (req->method != HTTP_POST) {
        return send_json(req, "405 Method Not Allowed", "{\"ok\":false,\"error\":\"method\"}");
    }

    if (wifi_credentials_is_provisioned()) {
        return send_json(req, "409 Conflict", "{\"ok\":false,\"error\":\"already_provisioned\"}");
    }

    char body[REQ_BODY_MAX];
    if (read_request_body(req, body, sizeof(body), NULL) != ESP_OK) {
        return send_json(req, "400 Bad Request", "{\"ok\":false,\"error\":\"body\"}");
    }

    char new_pwd[WIFI_CRED_PWD_MAX_LEN + 1];
    char factory_pwd[WIFI_CRED_PWD_MAX_LEN + 1];
    if (!json_get_string(body, "password", new_pwd, sizeof(new_pwd)) ||
        !json_get_string(body, "factoryPassword", factory_pwd, sizeof(factory_pwd))) {
        return send_json(req, "400 Bad Request", "{\"ok\":false,\"error\":\"json\"}");
    }

    if (!wifi_credentials_is_valid_password(new_pwd)) {
        return send_json(req, "400 Bad Request", "{\"ok\":false,\"error\":\"password_invalid\"}");
    }

    char current[WIFI_CRED_PWD_MAX_LEN + 1];
    if (wifi_credentials_get_password(current, sizeof(current)) != ESP_OK) {
        return send_json(req, "500 Internal Server Error", "{\"ok\":false,\"error\":\"internal\"}");
    }
    if (strcmp(current, factory_pwd) != 0) {
        return send_json(req, "403 Forbidden", "{\"ok\":false,\"error\":\"factory_password\"}");
    }

    if (wifi_credentials_set_password(new_pwd) != ESP_OK) {
        return send_json(req, "500 Internal Server Error", "{\"ok\":false,\"error\":\"nvs\"}");
    }

    char resp[96];
    snprintf(resp, sizeof(resp), "{\"ok\":true,\"ssid\":\"%s\"}", wifi_credentials_get_ssid());
    esp_err_t send_err = send_json(req, "200 OK", resp);
    if (send_err != ESP_OK) {
        return send_err;
    }

    vTaskDelay(pdMS_TO_TICKS(150));
    esp_err_t ap_err = wifi_softap_apply_password(new_pwd);
    if (ap_err != ESP_OK) {
        ESP_LOGE(TAG, "apply password failed: %s", esp_err_to_name(ap_err));
    }
    ESP_LOGI(TAG, "Wi-Fi provisioned; AP restarted");
    return ESP_OK;
}

static esp_err_t wifi_factory_reset_handler(httpd_req_t *req)
{
    if (req->method != HTTP_POST) {
        return send_json(req, "405 Method Not Allowed", "{\"ok\":false,\"error\":\"method\"}");
    }

    if (!wifi_credentials_is_provisioned()) {
        return send_json(req, "409 Conflict", "{\"ok\":false,\"error\":\"not_provisioned\"}");
    }

    char body[REQ_BODY_MAX];
    if (read_request_body(req, body, sizeof(body), NULL) != ESP_OK) {
        return send_json(req, "400 Bad Request", "{\"ok\":false,\"error\":\"body\"}");
    }

    char current_pwd[WIFI_CRED_PWD_MAX_LEN + 1];
    if (!json_get_string(body, "currentPassword", current_pwd, sizeof(current_pwd))) {
        return send_json(req, "400 Bad Request", "{\"ok\":false,\"error\":\"json\"}");
    }

    char active[WIFI_CRED_PWD_MAX_LEN + 1];
    if (wifi_credentials_get_password(active, sizeof(active)) != ESP_OK) {
        return send_json(req, "500 Internal Server Error", "{\"ok\":false,\"error\":\"internal\"}");
    }
    if (strcmp(active, current_pwd) != 0) {
        return send_json(req, "403 Forbidden", "{\"ok\":false,\"error\":\"current_password\"}");
    }

    if (wifi_credentials_factory_reset() != ESP_OK) {
        return send_json(req, "500 Internal Server Error", "{\"ok\":false,\"error\":\"nvs\"}");
    }

    esp_err_t send_err = send_json(req, "200 OK", "{\"ok\":true}");
    if (send_err != ESP_OK) {
        return send_err;
    }

    vTaskDelay(pdMS_TO_TICKS(150));
    esp_err_t ap_err = wifi_softap_apply_password(CONFIG_ESP_WIFI_PASSWORD);
    if (ap_err != ESP_OK) {
        ESP_LOGE(TAG, "factory reset apply failed: %s", esp_err_to_name(ap_err));
    }
    ESP_LOGI(TAG, "Wi-Fi factory reset; AP restarted with default password");
    return ESP_OK;
}

esp_err_t wifi_provision_http_register(httpd_handle_t server)
{
    if (server == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    httpd_uri_t status = {
        .uri = "/wifi/status",
        .method = HTTP_GET,
        .handler = wifi_status_handler,
        .user_ctx = NULL,
    };
    httpd_uri_t provision = {
        .uri = "/wifi/provision",
        .method = HTTP_POST,
        .handler = wifi_provision_handler,
        .user_ctx = NULL,
    };
    httpd_uri_t factory_reset = {
        .uri = "/wifi/factory-reset",
        .method = HTTP_POST,
        .handler = wifi_factory_reset_handler,
        .user_ctx = NULL,
    };

    esp_err_t err = httpd_register_uri_handler(server, &status);
    if (err != ESP_OK) {
        return err;
    }
    err = httpd_register_uri_handler(server, &provision);
    if (err != ESP_OK) {
        return err;
    }
    return httpd_register_uri_handler(server, &factory_reset);
}
