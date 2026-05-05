# drone\_wifi — ESP32 Wi‑Fi soft‑AP firmware

Turns the ESP32 into a **Wi‑Fi access point** and runs a lightweight **HTTP server** on port 80. The mobile app joins this network to stream camera data and other high‑bandwidth content from the drone.

BLE (in `drone_ble`) handles all flight commands and telemetry. This module is used only when Wi‑Fi connectivity is needed — typically for live video.

---

## Directory layout

```
drone_wifi/
└── softAP/
    ├── main/
    │   ├── softap_example_main.c   Soft-AP init + HTTP server + stream/root handlers
    │   ├── CMakeLists.txt
    │   └── Kconfig.projbuild       menuconfig: SSID, password, channel, max clients
    └── README.md                   ESP-IDF boilerplate reference
```

---

## Build and flash

```bash
. $HOME/esp/esp-idf/export.sh
cd drone_wifi/softAP
idf.py set-target esp32          # first time only
idf.py menuconfig                # set SSID and password (see below)
idf.py -p /dev/ttyUSB0 flash monitor
```

### Configuring the access point (`menuconfig → Example Configuration`)

| Option | Default | Notes |
|--------|---------|-------|
| `CONFIG_ESP_WIFI_SSID` | `"myssid"` | Set to a recognisable name, e.g. `"DroneAP"` |
| `CONFIG_ESP_WIFI_PASSWORD` | `"mypassword"` | Min 8 chars for WPA2; leave blank for open network |
| `CONFIG_ESP_WIFI_CHANNEL` | `1` | Wi‑Fi channel (1–13) |
| `CONFIG_ESP_MAX_STA_CONN` | `4` | Max simultaneous clients |

The mobile app's Wi‑Fi scan will show whatever SSID you configure here.

---

## HTTP endpoints

Once the phone joins the drone's access point, the HTTP server is reachable at **`http://192.168.4.1/`** (ESP‑IDF soft‑AP default gateway).

| Endpoint | Method | Response | Description |
|----------|--------|----------|-------------|
| `/` | GET | `text/plain` — `"ESP32-C3 Wi-Fi test alive"` | Reachability probe used by the mobile app |
| `/stream` | GET | `text/plain` chunked — `tick=N\n` every 200 ms | Placeholder streaming endpoint; replace with MJPEG for real video |

The mobile app (`src/stream/droneStream.ts`) probes `GET /` to confirm the drone is reachable before attempting to load the stream. A 200 OK from `/` is all that is needed for the Video tab to show the stream view.

---

## Replacing the placeholder stream

The current `/stream` handler sends a text tick counter. To stream real camera frames:

1. Attach a camera module (e.g. OV2640 via SCCB/I2C + parallel or MIPI interface).
2. Replace `stream_handler` in `softap_example_main.c` with an MJPEG chunked response:
   - Set `Content-Type: multipart/x-mixed-replace; boundary=frame`
   - For each frame: send the boundary header, JPEG data, and boundary footer.
3. The mobile app's `buildMjpegViewerHtml()` renders an `<img src="/stream">` in a WebView, which natively handles MJPEG streams.

---

## Integration with the rest of the system

```
Phone (Video tab)
  │
  └── Wi-Fi ──► drone_wifi soft-AP (192.168.4.1)
                    └── GET /stream  →  MJPEG frames (future camera)
                    └── GET /        →  reachability probe
```

Wi‑Fi and BLE operate independently. The phone can be connected to the drone AP and BLE at the same time — flight control stays on BLE while video travels over Wi‑Fi.
