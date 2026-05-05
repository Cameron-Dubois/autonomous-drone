### Developer Onboarding

This section walks a new team member through setting up the full development environment — ESP‑IDF for firmware, Node/Expo for the mobile app — and getting the drone and phone talking to each other for the first time.

---

#### Prerequisites

Install the following before starting:

| Tool | Install guide | Used for |
|------|--------------|----------|
| **ESP‑IDF v5.x** | https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/ | All ESP32 firmware |
| **Node.js 18+** | https://nodejs.org/ | Mobile app |
| **Expo CLI** | `npm install -g expo-cli` | Mobile dev server |
| **EAS CLI** | `npm install -g eas-cli` | iOS cloud builds |
| **Git** | https://git-scm.com/ | Source control |

For hardware testing you will also need a USB‑to‑serial adapter that works with your ESP32 board.

---

#### Clone the repo

```bash
git clone https://github.com/Stephenwb1/autonomous-drone.git
cd autonomous-drone
```

---

#### 1. Set up ESP‑IDF

Follow the official Getting Started guide for your OS. After installation, source the environment script in every terminal session you use for firmware work:

```bash
# macOS / Linux
. $HOME/esp/esp-idf/export.sh

# Windows (PowerShell)
$HOME\esp\esp-idf\export.ps1
```

Verify with:

```bash
idf.py --version
```

---

#### 2. Flash the BLE firmware

The BLE firmware is required for the mobile app to communicate with the drone.

```bash
cd drone_ble
idf.py set-target esp32
idf.py menuconfig          # verify GPIO pins match your board wiring
idf.py -p /dev/ttyUSB0 flash monitor
```

You should see `GAP procedure initiated: advertise` in the serial monitor. The ESP32 is now advertising as **DroneBLE**.

> **Windows note:** use `COMx` instead of `/dev/ttyUSB0`. If you get a permission error on Linux, run `sudo chmod a+rw /dev/ttyACM0` (or your port) to grant access without sudo.

---

#### 3. Run the mobile app

```bash
cd mobile
npm install
npx expo start     # opens Expo Go — BLE will use mock data
```

To use **real BLE** with the drone you need a development build:

```bash
# Android
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android

# iOS (requires macOS + Xcode)
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios

# iOS without a Mac — cloud build via EAS
npx eas build --platform ios --profile development
```

---

#### 4. Connect the app to the drone

1. Make sure `drone_ble` is running on the ESP32 (serial monitor shows advertising).
2. Open the **Connect** tab in the app.
3. Tap **Scan for Devices** — **DroneBLE** should appear in the list.
4. Tap **DroneBLE** to connect.
5. Switch to the **Home** tab — the link status should change from `DISCONNECTED` to `SECURE_LINK` and telemetry values will update.

---

#### 5. Verify motor control (bench test, no props)

With the drone connected over BLE:

1. Open the **Control** tab.
2. Tap the **centre (Arm) button** — the drone sends an `ARM` command.
3. Press a D‑pad direction to spin individual motors. The motor percentage panel shows the commanded throttle.
4. Tap **Land** to disarm and zero all motors.

> **Safety:** Run all bench tests with propellers removed.

---

#### 6. Flash the flight control firmware (optional)

For IMU and PID testing, flash `flight_control` instead of `drone_ble`:

```bash
cd flight_control
idf.py set-target esp32
idf.py menuconfig          # set SDA/SCL GPIO pins for your IMU wiring
idf.py -p /dev/ttyUSB0 flash monitor
```

The serial monitor will print attitude angles and PID outputs at 10 Hz. Motors will not spin until `TEST_THROTTLE` is raised above zero.

---

#### 7. Set up Wi‑Fi video (optional)

```bash
cd drone_wifi/softAP
idf.py menuconfig          # set SSID and password under Example Configuration
idf.py -p /dev/ttyUSB0 flash monitor
```

On the phone, join the drone's access point (Android: use the **Connect** tab → Wi‑Fi section; iOS: use system Settings). Then open the **Video** tab — the placeholder stream (tick counter) will load once the drone is reachable.

---

#### Repository quick reference

| Directory | What it is |
|-----------|-----------|
| `flight_control/` | Flight loop firmware (IMU + PID + motors) |
| `drone_ble/` | BLE GATT firmware (command/telemetry bridge) |
| `drone_wifi/` | Wi‑Fi soft‑AP + HTTP server firmware |
| `mobile/` | React Native (Expo) phone app |
| `Drone tests/` | PlatformIO hardware integration tests |
| `motor_tests/` | Isolated motor‑driver test sketch |
| `documentation/` | Design docs, schematics, test plans |

---

#### Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `idf.py: command not found` | ESP‑IDF not sourced | Run `. $HOME/esp/esp-idf/export.sh` |
| `Permission denied /dev/ttyUSB0` | Port not accessible | `sudo chmod a+rw /dev/ttyUSB0` |
| App shows mock telemetry only | Running in Expo Go or `BLE_MOCK=1` | Use a dev build with `EXPO_PUBLIC_BLE_MOCK=0` |
| DroneBLE not appearing in scan | Firmware not advertising | Check serial monitor; reflash `drone_ble` |
| IMU init failed | Wrong SDA/SCL pins or I2C address | Run `idf.py menuconfig` and verify `CONFIG_IMU_I2C_SDA_GPIO` / `SCL_GPIO` |
| Wi‑Fi not appearing in app scan (iOS) | iOS blocks programmatic scan | Connect manually via system Settings → Wi‑Fi |
