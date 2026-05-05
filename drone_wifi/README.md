# drone\_wifi — ESP32 Wi‑Fi soft‑AP firmware

Turns the ESP32 into a **Wi‑Fi access point** and runs an **HTTP server** on port 80. The mobile app joins this network to receive camera frames and other high-bandwidth data. All flight commands and telemetry stay on BLE (`drone_ble`) — this module handles streaming only.

---

## Directory layout

```
drone_wifi/
└── softAP/
    ├── main/
    │   ├── softap_example_main.c   Soft-AP init, HTTP server, /stream and / handlers
    │   ├── CMakeLists.txt
    │   └── Kconfig.projbuild       menuconfig options: SSID, password, channel, max clients
    ├── CMakeLists.txt
    ├── sdkconfig.ci                CI build config (ESP32-C3 target)
    └── README.md                   ESP-IDF boilerplate reference
```

---

## Build and flash

```bash
# 1. Source ESP-IDF
. $HOME/esp/esp-idf/export.sh

# 2. Enter the project
cd drone_wifi/softAP

# 3. Set target chip (first time only — matches our ESP32-C3 board)
idf.py set-target esp32c3

# 4. Set your SSID and password
idf.py menuconfig
# → Example Configuration → WiFi SSID  (e.g. "DroneAP")
# → Example Configuration → WiFi Password  (min 8 chars, or leave blank for open)

# 5. Build, flash, monitor
idf.py -p /dev/ttyUSB0 flash monitor
```

Successful startup prints:

```
I (...) wifi softAP: wifi_init_softap finished. SSID:DroneAP password:yourpassword channel:1
I (...) wifi softAP: HTTP server started on http://192.168.4.1/ (root) and /stream
```

---

## menuconfig options (`Example Configuration`)

| Option | Default | Notes |
|--------|---------|-------|
| `CONFIG_ESP_WIFI_SSID` | `"myssid"` | The network name the phone will see |
| `CONFIG_ESP_WIFI_PASSWORD` | `"mypassword"` | Min 8 chars for WPA2; leave blank for open (no password) |
| `CONFIG_ESP_WIFI_CHANNEL` | `1` | Wi‑Fi channel 1–13 |
| `CONFIG_ESP_MAX_STA_CONN` | `4` | Max simultaneous clients |

---

## HTTP endpoints

Once the phone joins the drone's AP, the server is at **`http://192.168.4.1`**.

| Endpoint | Method | Current response | Purpose |
|----------|--------|-----------------|---------|
| `/` | GET | `"ESP32-C3 Wi-Fi test alive"` (text/plain) | Reachability probe — the mobile app polls this every 2.5 s |
| `/stream` | GET | `tick=N\n` chunked every 200 ms (text/plain) | **Placeholder** — replace with MJPEG for real video |

The mobile app's Video screen shows the stream as soon as `GET /` returns 200. The `/stream` content is loaded inside a `WebView` as an `<img src="/stream">`, which natively handles MJPEG streams.

---

## Replacing the placeholder stream with real video

1. Attach a camera module (e.g. OV2640 via the ESP32-S3 camera interface or I2C).
2. Replace `stream_handler` in `softap_example_main.c`:
   - Set `Content-Type: multipart/x-mixed-replace; boundary=frame`
   - For each frame: write the boundary + `Content-Type: image/jpeg` header, then the JPEG bytes, then the boundary.
3. No changes needed in the mobile app — it already renders MJPEG via `<img>` in a `WebView`.

---

## Connecting from the phone

**Android:**
1. In the mobile app → **Connect** tab → Wi‑Fi section.
2. Tap your drone's SSID → enter the password → connect.
3. Open the **Video** tab.

**iOS:**
1. Go to iPhone **Settings → Wi‑Fi** and join the drone's network manually.
2. Return to the app → **Video** tab.

> iOS does not allow apps to scan or join Wi‑Fi networks programmatically using `react-native-wifi-reborn`. Manual connection via system Settings is required.

---

## Integration with the rest of the system

Wi‑Fi and BLE are independent. The phone can be connected to both at the same time — BLE handles all flight control while Wi‑Fi carries video.

```
Phone
 ├── BLE  ──► drone_ble  (commands + telemetry — always on)
 └── Wi-Fi ──► drone_wifi  (camera stream — when needed)
```

Only one firmware can run on the ESP32 at a time. Decide which subsystem you are working on and flash accordingly.
