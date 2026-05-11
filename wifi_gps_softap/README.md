# WiFi SoftAP + GPS + compass + TLS

This project merges:

- **HTTPS server** — Single TLS server on port **443** with `/` health check, `/stream` chunked ticks, and **`/gps`** JSON snapshot.
- **Secure WebSocket** — Same TLS server, path **`/ws`**, pushes JSON telemetry ~5 Hz (`droneLat`, `droneLon`, `droneGpsValid`, `droneHeadingDeg`, …).
- **NimBLE** — Same binary advertises **`DroneBLE`**; GATT writes accept flight commands; notifications send **Base64(JSON)** telemetry aligned with `/gps` when a phone is subscribed.
- **[`gps_bringup`](../gps_bringup)** — NMEA GPS over UART and magnetometer on I2C (sources are **included by path** from `gps_bringup/main`, not duplicated).

Pin and bus definitions live in [`gps_bringup/main/board_config.h`](../gps_bringup/main/board_config.h).

Flash is assumed **2 MB**; the custom [`partitions.csv`](partitions.csv) keeps the factory app below the flash size limit with NimBLE enabled.

## Build

From this directory (with ESP-IDF environment loaded):

```bash
idf.py set-target esp32c3
idf.py menuconfig   # Example Configuration → WiFi SSID / password
idf.py -p PORT flash monitor
```

[sdkconfig.defaults](sdkconfig.defaults) requests `CONFIG_HTTPD_WS_SUPPORT=y`.

The TLS certificate and key are embedded from:

- [`main/certs/servercert.pem`](main/certs/servercert.pem)
- [`main/certs/prvkey.pem`](main/certs/prvkey.pem)

Regenerate them if needed (must include SoftAP IP in SAN):

```bash
cd main/certs
openssl req -x509 -newkey rsa:2048 \
  -keyout prvkey.pem \
  -out servercert.pem \
  -days 3650 -nodes \
  -subj "/CN=drone-ap" \
  -addext "subjectAltName=IP:192.168.4.1"
```

## Phone browser (quick test)

1. Connect the phone to the drone Wi‑Fi.
2. Open Safari or Chrome and go to: **`https://192.168.4.1/gps`**
3. You should see JSON (`droneLat`, `droneLon`, `droneGpsValid`, …). Pull to refresh to update.

Until the GPS has a satellite fix, `droneGpsValid` will be `false` and lat/lon will be `null`.

The live app link is secure WebSocket: **`wss://192.168.4.1/ws`**.

## Phone app

This firmware is now **443-only TLS**. Existing app code that still points to `http://` / `ws://...:81` must be updated to `https://` / `wss://` and trust the self-signed cert.

## Verify TLS + self-signed cert

Run these while connected to the drone Wi-Fi:

```bash
openssl s_client -connect 192.168.4.1:443 -showcerts
curl -vk https://192.168.4.1/gps
```

Expected:

- TLS handshake succeeds on port 443.
- Certificate details show subject `CN=drone-ap` and SAN IP `192.168.4.1`.
- OpenSSL verify status is non-zero unless you trust the cert chain (normal for self-signed).

## Team handoff (mobile follow-up)

Firmware status in this folder:

- `wifi_gps_softap` now serves HTTPS + secure WebSocket on port 443 only.
- Verified working with:
  - `curl -vk https://192.168.4.1/gps`
  - `openssl s_client -connect 192.168.4.1:443 -showcerts`
  - phone browser at `https://192.168.4.1/gps`
- Certificate is self-signed (`CN=drone-ap`) and includes SAN IP `192.168.4.1`.

Exact commands used to verify TLS:

```bash
curl -vk https://192.168.4.1/gps
openssl s_client -connect 192.168.4.1:443 -showcerts
```

Expected indicators from those commands:

- `curl`: `SSL connection using TLSv1.2` and `HTTP/1.1 200 OK` with JSON body.
- `openssl`: certificate subject/issuer `CN=drone-ap` and `Verify return code: 18 (self-signed certificate)`.

App team next steps (outside this folder):

- Update drone URLs from `http://` / `ws://...:81` to `https://` / `wss://192.168.4.1/ws`.
- Add platform trust handling for the self-signed cert (especially Android/iOS app runtime).
- Re-test telemetry and any stream/probe paths against TLS endpoints.
