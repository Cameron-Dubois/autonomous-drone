# Autonomous Drone

UCSC **CSE 123** project — a small **quadcopter** built around ESP32 firmware and a React Native (Expo) phone app. The phone connects over **Bluetooth LE** for commands and telemetry, and over **Wi‑Fi** for camera streaming.

---

## Quick start (clone → test → contribute)

```bash
git clone https://github.com/Stephenwb1/autonomous-drone.git
cd autonomous-drone
```

See the per-module READMEs below for full setup. For a guided walkthrough see [`documentation/markdown/13_Developer_Onboarding.md`](documentation/markdown/13_Developer_Onboarding.md).

---

## Repository layout

```
autonomous-drone/
├── flight_control/     ESP32 firmware — IMU, sensor fusion, PID, motor mixing
├── drone_ble/          ESP32 firmware — BLE GATT server, command/telemetry bridge
├── drone_wifi/         ESP32 firmware — Wi-Fi soft-AP and HTTP server
├── motor_tests/        ESP32 firmware — standalone motor ramp-up test
├── Drone tests/        Arduino/PlatformIO hardware integration test suite
├── mobile/             React Native (Expo) phone app
├── documentation/      Design docs, schematics, test plans, diagrams
└── README.md           This file
```

---

## Build and test status

| Module | Build tool | Builds? | Automated tests | Notes |
|--------|-----------|---------|-----------------|-------|
| `flight_control` | ESP‑IDF `idf.py` | ✅ | Serial output only | Default target: ESP32‑C3 |
| `drone_wifi` | ESP‑IDF `idf.py` | ✅ | Serial output only | Default target: ESP32‑C3 |
| `motor_tests` | ESP‑IDF `idf.py` | ✅ | Serial output only | Default target: ESP32‑C3 |
| `drone_ble` | ESP‑IDF `idf.py` | ⚠️ | Serial output only | Requires fix before first build — see [`drone_ble/README.md`](drone_ble/README.md) |
| `Drone tests` | PlatformIO | ✅ | 8 hardware tests (need ESP32‑C3 + motors) | Upload one test at a time |
| `mobile` | Node / Expo | ✅ | `npm test` (Jest, no device needed) | iOS Simulator unsupported — real device required for BLE/Wi‑Fi |

---

## Prerequisites

### ESP‑IDF firmware (flight_control, drone_ble, drone_wifi, motor_tests)

1. Install **ESP‑IDF v5.x** following the [official guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/) for your OS.
2. Source the environment in every terminal you use for firmware work:

```bash
# macOS / Linux
. $HOME/esp/esp-idf/export.sh

# Windows (PowerShell)
$HOME\esp\esp-idf\export.ps1
```

3. Verify: `idf.py --version` should print a v5.x version.

> **Linux serial port access:** if you get `Permission denied` on `/dev/ttyUSB0` or `/dev/ttyACM0`, run `sudo chmod a+rw /dev/<your-port>` once per session, or add yourself to the `dialout` group permanently: `sudo usermod -aG dialout $USER` (then log out and back in).

### PlatformIO (Drone tests)

Install the **PlatformIO** extension for VS Code from the [Extensions Marketplace](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide), or install the CLI:

```bash
pip install platformio
```

### Mobile app

- **Node.js 18+** — https://nodejs.org/
- **Expo CLI** — installed automatically via `npx`
- **EAS CLI** (cloud iOS builds only) — `npm install -g eas-cli`

---

## Building and flashing firmware

The pattern is the same for all ESP‑IDF modules:

```bash
. $HOME/esp/esp-idf/export.sh
cd <module>              # e.g. flight_control

idf.py set-target esp32c3   # matches our ESP32-C3 board; only needed once per checkout
idf.py menuconfig            # optional: adjust GPIO pins, SSID, etc.
idf.py build                 # compile only — good for a quick sanity check
idf.py -p /dev/ttyUSB0 flash monitor   # build + flash + open serial monitor
```

> **⚠️ drone_ble requires one extra step before building.** The `dependencies.lock` file contains a hardcoded path to the original developer's machine. Delete it before your first build and let ESP‑IDF regenerate it:
> ```bash
> cd drone_ble
> rm dependencies.lock
> idf.py build
> ```
> See [`drone_ble/README.md`](drone_ble/README.md) for full details.

### Serial port by OS

| OS | Typical port |
|----|-------------|
| Linux | `/dev/ttyUSB0` or `/dev/ttyACM0` |
| macOS | `/dev/cu.usbserial-*` or `/dev/cu.SLAB_USBtoUART` |
| Windows | `COM3`, `COM4`, etc. (check Device Manager) |

---

## Running the mobile app

```bash
cd mobile
npm install
```

### Running automated tests (no device required)

```bash
npm test               # Jest unit tests — runs anywhere
npm run typecheck      # TypeScript check — runs anywhere
npm run smoke          # typecheck + jest together
```

### Running the app

| Method | Command | BLE/Wi‑Fi | Notes |
|--------|---------|-----------|-------|
| Expo Go | `npx expo start` | Mock only | Quickest way to see the UI; no real drone comms |
| Android dev build | `EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android` | ✅ Real | Requires Android device or emulator |
| iOS dev build | `EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios` | ✅ Real (device only) | Requires macOS + Xcode; **iOS Simulator does not support BLE or Wi‑Fi native modules** — use a real iPhone |
| iOS cloud build | `npx eas build --platform ios --profile development` | ✅ Real | No Mac required; install the `.ipa` on your iPhone |

---

## How the pieces connect

```
Phone (React Native app)
  │
  ├── Bluetooth LE ──► drone_ble firmware (GATT server)
  │                         └── Commands: ARM/DISARM/ESTOP/SET_MOTOR/etc.
  │                         └── Telemetry: TEL or JSON over BLE notifications
  │
  └── Wi-Fi ───────────► drone_wifi firmware (soft-AP + HTTP)
                              └── GET /stream  →  camera / MJPEG (future)
                              └── GET /        →  reachability probe
```

Only one firmware image runs at a time:
- Use **`drone_ble`** when working on mobile app integration.
- Use **`flight_control`** when working on the flight loop (IMU, PID, motors).
- Use **`drone_wifi`** when working on camera or Wi‑Fi streaming.

---

## Documentation index

| Document | Path |
|----------|------|
| Developer onboarding (start here) | `documentation/markdown/13_Developer_Onboarding.md` |
| Mobile app architecture | `documentation/markdown/12_Mobile_App_Architecture.md` |
| Communication protocol | `documentation/markdown/11_Communication_Protocol.md` |
| GPS and telemetry schema | `documentation/markdown/10_GPS_Telemetry.md` |
| BLE protocol reference | `drone_ble/BLE_PROTOCOL_MOBILE.md` |
| Test plan | `documentation/test-plan.md` |
| Schematics | `documentation/Drone_Schematic_*.pdf` |
| Full design document | `documentation/markdown/` |
