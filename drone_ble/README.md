# drone\_ble — ESP32 BLE GATT firmware

BLE GATT server that bridges the mobile app to the drone's motors. Advertises as **DroneBLE**, accepts command writes from the phone, drives motors, and sends telemetry notifications back.

---

## ⚠️ Known build issue — fix required before first build

The `dependencies.lock` file in this directory contains a **hardcoded absolute path** to the original developer's machine:

```
path: /home/stephenwb/esp/esp-idf/examples/bluetooth/nimble/common/nimble_peripheral_utils
```

This path does not exist on any other machine, so `idf.py build` will fail with a component resolution error.

**Fix — delete the lock file before building:**

```bash
cd drone_ble
rm dependencies.lock
idf.py build
```

ESP‑IDF will regenerate `dependencies.lock` using the `${IDF_PATH}` variable from your local install. You only need to do this once after cloning.

---

## Directory layout

```
drone_ble/
├── main/
│   ├── main.c          BLE init, advertising, app_main
│   ├── gatt_svr.c      GATT server — service/characteristic definitions, read/write/notify
│   ├── bleprph.h       Command ID enum (drone_cmd_id_t), shared constants
│   ├── motor.c/.h      Brushed motor driver (same API as flight_control)
│   ├── motor_test.c    Standalone motor test (swap into CMakeLists to use)
│   ├── idf_component.yml   Declares nimble_peripheral_utils dependency
│   └── Kconfig.projbuild   menuconfig: BLE security options, IMU/motor GPIO pins
├── CMakeLists.txt
├── sdkconfig.defaults      Enables NimBLE BLE stack
├── dependencies.lock       ⚠️ Delete before first build on a new machine
└── BLE_PROTOCOL_MOBILE.md  Full protocol reference for mobile ↔ firmware
```

---

## Prerequisites

- **ESP‑IDF v5.x** — https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/
- The `nimble_peripheral_utils` component ships with ESP‑IDF at `$IDF_PATH/examples/bluetooth/nimble/common/nimble_peripheral_utils`. It does **not** need to be downloaded separately.

---

## Build and flash

```bash
# 1. Source ESP-IDF
. $HOME/esp/esp-idf/export.sh

# 2. Enter the directory
cd drone_ble

# 3. Delete stale lock file (REQUIRED on first build after cloning)
rm dependencies.lock

# 4. Set target chip
idf.py set-target esp32    # or esp32c3 / esp32c6 — match your board

# 5. (Optional) adjust GPIO pins for motors / IMU
idf.py menuconfig

# 6. Build, flash, monitor
idf.py -p /dev/ttyUSB0 flash monitor
```

Successful startup looks like:

```
I (...)  NimBLE_BLE_PRPH: BLE Host Task Started
GAP procedure initiated: advertise; ...
```

The ESP32 is now advertising as **DroneBLE** and waiting for a connection.

---

## menuconfig options

### Motor GPIO (`Motor Configuration`)

| Option | Default | Description |
|--------|---------|-------------|
| `CONFIG_MOTOR_1_PWM_GPIO` | 0 | Motor 1 PWM pin |
| `CONFIG_MOTOR_1_DIR_GPIO` | 1 | Motor 1 direction pin |
| `CONFIG_MOTOR_2_PWM_GPIO` | 3 | Motor 2 PWM pin |
| `CONFIG_MOTOR_2_DIR_GPIO` | 4 | Motor 2 direction pin |
| `CONFIG_MOTOR_3_PWM_GPIO` | 5 | Motor 3 PWM pin |
| `CONFIG_MOTOR_3_DIR_GPIO` | 6 | Motor 3 direction pin |
| `CONFIG_MOTOR_4_PWM_GPIO` | 7 | Motor 4 PWM pin |
| `CONFIG_MOTOR_4_DIR_GPIO` | 9 | Motor 4 direction pin |

### IMU GPIO (`ICM-42670-P IMU Configuration`)

| Option | Default | Description |
|--------|---------|-------------|
| `CONFIG_IMU_I2C_SDA_GPIO` | 4 | I2C SDA pin |
| `CONFIG_IMU_I2C_SCL_GPIO` | 5 | I2C SCL pin |
| `CONFIG_IMU_I2C_FREQ_HZ` | 400000 | I2C clock (Hz) |
| `CONFIG_IMU_AD0_HIGH` | off | Set if IMU AD0 pin is pulled HIGH (addr 0x69) |

---

## GATT layout

| Role | UUID |
|------|------|
| Service | `59462f12-9543-9999-12c8-58b459a2712d` |
| Characteristic | `33333333-2222-2222-1111-111100000000` |

- **Writes (phone → drone):** binary command packet, Base64-encoded.
- **Notifications (drone → phone):** telemetry string (`TEL …` or JSON), Base64-encoded.

See [`BLE_PROTOCOL_MOBILE.md`](BLE_PROTOCOL_MOBILE.md) for the full packet format, command table, and telemetry key reference.

---

## Verifying with the mobile app

1. Flash this firmware and confirm `DroneBLE` appears in the serial monitor.
2. Open the mobile app → **Connect** tab → **Scan for Devices**.
3. Tap **DroneBLE** → connect.
4. The **Home** tab should show `SECURE_LINK`.
5. Open the **Control** tab → press the **Arm** button (D-pad centre) — the firmware should log the received command.
