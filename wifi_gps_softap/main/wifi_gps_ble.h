#pragma once

#include <stdint.h>
#include "host/ble_hs.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Start NimBLE host + advertising (call after NVS + Wi‑Fi + motors stub init). */
void wifi_gps_ble_stack_start(void);

/** Connection handle for active central, or BLE_HS_CONN_HANDLE_NONE. */
uint16_t wifi_gps_ble_active_conn_handle(void);

#ifdef __cplusplus
}
#endif
