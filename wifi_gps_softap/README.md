# WiFi SoftAP + GPS + compass

This project merges:

- **[`drone_wifi/softAP`](../drone_wifi/softAP)** — ESP32 SoftAP and HTTP server on port 80 (`/` health check, `/stream` chunked ticks, **`/gps`** JSON snapshot for a phone browser).
- **WebSocket** — Second HTTP server on **port 81**, path **`/ws`**, pushes JSON telemetry ~5 Hz (`droneLat`, `droneLon`, `droneGpsValid`, `droneHeadingDeg`, …) for [`wifi-comms.ts`](../mobile/src/comms/wifi-comms.ts).
- **[`gps_bringup`](../gps_bringup)** — NMEA GPS over UART and magnetometer on I2C (sources are **included by path** from `gps_bringup/main`, not duplicated).

Pin and bus definitions live in [`gps_bringup/main/board_config.h`](../gps_bringup/main/board_config.h).

## Build

From this directory (with ESP-IDF environment loaded):

```bash
idf.py set-target esp32c3
idf.py menuconfig   # Example Configuration → WiFi SSID / password
idf.py -p PORT flash monitor
```

[sdkconfig.defaults](sdkconfig.defaults) requests `CONFIG_HTTPD_WS_SUPPORT=y`. If you already have a generated [sdkconfig](sdkconfig) from an older build, it may still contain `# CONFIG_HTTPD_WS_SUPPORT is not set` (WebSocket disabled)—change that to **`CONFIG_HTTPD_WS_SUPPORT=y`** or run **`idf.py menuconfig`** → *Component config* → *HTTP Server* → enable **WebSocket server support**, then rebuild.

## Phone browser (quick test)

1. Connect the phone to the drone Wi‑Fi.
2. Open Safari or Chrome and go to: **`http://192.168.4.1/gps`**
3. You should see JSON (`droneLat`, `droneLon`, `droneGpsValid`, …). Pull to refresh to update.

Until the GPS has a satellite fix, `droneGpsValid` will be `false` and lat/lon will be `null`.

The live app link is **WebSocket** (`ws://192.168.4.1:81/ws`), not something you type like a normal website URL.

## Phone app

Join the drone AP, then open the app: [`CommsProvider`](../mobile/src/context/CommsContext.tsx) connects to **`ws://192.168.4.1:81/ws`** and parses each JSON line as telemetry.

### Troubleshooting

- **`error in creating ctrl socket (112)`** on the second server: two `httpd` instances cannot share the same `ctrl_port`. The WS server sets `ctrl_port = ESP_HTTPD_DEF_CTRL_PORT + 1` (see `softap_gps_main.c`).
