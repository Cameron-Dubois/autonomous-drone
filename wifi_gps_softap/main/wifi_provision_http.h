#pragma once

#include "esp_http_server.h"

/** Register /wifi/status, /wifi/provision, /wifi/factory-reset on the HTTPS server. */
esp_err_t wifi_provision_http_register(httpd_handle_t server);
