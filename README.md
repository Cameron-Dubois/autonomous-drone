# Autonomous Drone

UCSC **CSE 123** project: a small **quadcopter** built around **ESP32** firmware and a **React Native (Expo)** phone app. The drone talks to the phone over **Bluetooth LE** (and Wi‑Fi where used); onboard code handles **motors**, **sensors**, and **flight control**.

---

## Repository layout

```
autonomous-drone/
├── flight_control/     ESP32 firmware — sensor fusion, PID, and motor mixing (main flight loop)
├── drone_ble/          ESP32 firmware — BLE GATT server and command/telemetry bridge
├── drone_wifi/         ESP32 firmware — Wi‑Fi soft‑AP and HTTP utilities
├── motor_tests/        Isolated motor‑driver tests (PlatformIO)
├── Drone tests/        Hardware integration test suite (PlatformIO)
├── mobile/             React Native (Expo) phone app — control UI, BLE/Wi‑Fi comms
├── documentation/      Design documents, schematics, test plans, and diagrams
└── README.md           This file
```

---

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [ESP‑IDF](https://docs.espressif.com/projects/esp-idf/en/latest/) | v5.x | All ESP32 firmware |
| [Node.js](https://nodejs.org/) | 18+ | Mobile app |
| [Expo CLI](https://docs.expo.dev/) | latest | Mobile app dev server / builds |
| [EAS CLI](https://docs.expo.dev/eas/) | latest | Cloud builds (iOS) |
| [PlatformIO](https://platformio.org/) | latest | Motor and hardware tests |

---

## Building and flashing firmware

All three firmware projects (`flight_control`, `drone_ble`, `drone_wifi`) use **ESP‑IDF** with `idf.py`.

```bash
# 1. Source ESP-IDF (adjust path to your install)
. $HOME/esp/esp-idf/export.sh

# 2. Enter the firmware directory
cd flight_control   # or drone_ble / drone_wifi

# 3. Set the target chip (first time only)
idf.py set-target esp32

# 4. (Optional) open menuconfig to adjust GPIO pins, IMU address, etc.
idf.py menuconfig

# 5. Build, flash, and open the serial monitor
idf.py -p /dev/ttyUSB0 flash monitor
```

Replace `/dev/ttyUSB0` with your serial port (`COMx` on Windows, `/dev/cu.usbserial-*` on macOS).

### Which firmware to flash

| Module | Purpose | Flash when |
|--------|---------|------------|
| `flight_control` | Full flight loop: IMU → sensor fusion → PID → motor mixing | Active flight testing |
| `drone_ble` | BLE GATT server + command/telemetry bridge | Integrating with the mobile app |
| `drone_wifi` | Wi‑Fi soft‑AP + HTTP server | Streaming or Wi‑Fi comms work |

Only one firmware runs at a time. `flight_control` is the intended production image; `drone_ble` is used during mobile integration work.

---

## Running the mobile app

```bash
cd mobile
npm install

# Development server (Expo Go — no BLE/Wi‑Fi native modules)
npx expo start

# Development build with native BLE and Wi‑Fi (required for real drone comms)
npx expo run:android    # Android device or emulator
npx expo run:ios        # macOS only, requires Xcode

# Cloud build for iOS (no Mac required)
npx eas build --platform ios --profile development
```

Set `EXPO_PUBLIC_BLE_MOCK=0` to force the real BLE stack (disables the in-app mock).

---

## How the pieces connect

```
Phone (React Native app)
  │
  ├── Bluetooth LE ──► drone_ble firmware (GATT server)
  │                        │
  │                        └── Commands decoded → motor_set_speed / arm / disarm
  │                        └── Telemetry encoded → BLE notifications → app
  │
  └── Wi‑Fi ──────────► drone_wifi firmware (soft‑AP + HTTP)
                             └── Camera frames / high‑bandwidth data
```

- **Control and telemetry** travel over BLE. The app writes binary command packets and receives `TEL`/JSON telemetry strings via GATT notifications.
- **High‑bandwidth data** (camera, future video) travels over Wi‑Fi once the phone has joined the drone's soft‑AP.
- The phone's own GNSS position (`usePhoneLocation`) is displayed alongside drone telemetry but is **not** sent to the firmware.

See [`drone_ble/BLE_PROTOCOL_MOBILE.md`](drone_ble/BLE_PROTOCOL_MOBILE.md) for full command and telemetry wire formats, and [`documentation/markdown/11_Communication_Protocol.md`](documentation/markdown/11_Communication_Protocol.md) for the overall communication architecture.

---

## Documentation

| Document | Location |
|----------|----------|
| Design document (full) | `documentation/markdown/` |
| BLE protocol reference | `drone_ble/BLE_PROTOCOL_MOBILE.md` |
| Communication protocol overview | `documentation/markdown/11_Communication_Protocol.md` |
| GPS and telemetry schema | `documentation/markdown/10_GPS_Telemetry.md` |
| Test plan | `documentation/test-plan.md` |
| Test results | `documentation/test-documentation.md` |
| Schematics (PDF) | `documentation/Drone_Schematic_*.pdf` |
