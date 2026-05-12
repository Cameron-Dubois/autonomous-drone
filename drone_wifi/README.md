# drone_wifi — ESP32 Wi‑Fi soft‑AP firmware

Turns the ESP32 into a **Wi‑Fi access point** and runs an **HTTP server** on port 80. The mobile app joins this network for **camera streaming** and other high-bandwidth data. Flight commands and telemetry usually stay on **BLE** (`drone_ble` / `flight_control`); this project is for **Wi‑Fi when you need it** (e.g. live video).

---

## Directory layout

```
drone_wifi/
└── softAP/
    ├── main/
    │   ├── softap_example_main.c   Soft-AP init, HTTP server, `/` and `/stream` handlers
    │   ├── CMakeLists.txt
    │   └── Kconfig.projbuild       menuconfig: SSID, password, channel, max clients
    ├── CMakeLists.txt
    ├── sdkconfig.ci                CI build config (ESP32-C3 target)
    └── README.md                   ESP-IDF boilerplate reference
```

---

## Build and flash

```bash
# 1. Source ESP-IDF
. $HOME/esp/esp-idf/export.sh   # Windows: use export.ps1 from ESP-IDF

# 2. Enter the project
cd drone_wifi/softAP

# 3. Set target chip (first time only — ESP32-C3 example)
idf.py set-target esp32c3

# 4. SSID and password
idf.py menuconfig
# → Example Configuration → WiFi SSID  (e.g. "DroneAP")
# → Example Configuration → WiFi Password  (min 8 chars for WPA2, or blank for open)

# 5. Build, flash, monitor
idf.py -p PORT flash monitor
```

On Windows, replace `PORT` with `COMx`. On Linux, often `/dev/ttyUSB0`.

### menuconfig options (`Example Configuration`)

| Option | Default | Notes |
|--------|---------|-------|
| `CONFIG_ESP_WIFI_SSID` | `"myssid"` | Network name the phone will see |
| `CONFIG_ESP_WIFI_PASSWORD` | `"mypassword"` | Min 8 chars for WPA2; blank for open AP |
| `CONFIG_ESP_WIFI_CHANNEL` | `1` | Channel 1–13 |
| `CONFIG_ESP_MAX_STA_CONN` | `4` | Max simultaneous clients |

Successful startup looks similar to:

```
I (...) wifi softAP: wifi_init_softap finished. SSID:DroneAP ...
I (...) wifi softAP: HTTP server started on http://192.168.4.1/ (root) and /stream
```

---

## HTTP endpoints

After the phone joins the drone’s AP, the server is at **`http://192.168.4.1/`** (soft‑AP default gateway).

| Endpoint | Method | Response | Purpose |
|----------|--------|----------|---------|
| `/` | GET | `text/plain` — e.g. alive string | Reachability probe — mobile app polls periodically |
| `/stream` | GET | Placeholder chunked stream or MJPEG | Video; replace placeholder with real MJPEG for camera |

The mobile app probes `GET /` before loading the stream. A **200 OK** from `/` is enough for the Video tab to treat the drone as reachable.

---

## Replacing the placeholder stream

The template `/stream` handler may send a simple tick counter. For real video:

1. Attach a camera (e.g. OV2640; chip-dependent interface).
2. In `softap_example_main.c`, implement MJPEG in `stream_handler`:
   - `Content-Type: multipart/x-mixed-replace; boundary=frame`
   - Per frame: boundary + `Content-Type: image/jpeg` + JPEG bytes.
3. The mobile app can render MJPEG via `<img src="/stream">` in a WebView (`buildMjpegViewerHtml()` pattern).

---

## Connecting from the phone

**Android:** **Connect** tab → Wi‑Fi → join the drone SSID → **Video** tab.

**iOS:** **Settings → Wi‑Fi** → join manually → return to app → **Video** tab.

iOS generally cannot join arbitrary networks entirely from app code; system Settings is required.

---

## Integration with the rest of the system

Wi‑Fi and BLE are independent. The phone can use **BLE for control/telemetry** and **Wi‑Fi for video** at the same time when both stacks are available.

```
Phone
 ├── BLE  ──► flight_control / drone_ble  (commands + telemetry)
 └── Wi-Fi ──► drone_wifi (camera stream when needed)
```

Only **one** ESP32 firmware image runs on a single board at a time. Use separate modules or swap flashes depending on what you are testing.
