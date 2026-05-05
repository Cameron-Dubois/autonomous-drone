# motor\_tests — ESP32 motor ramp-up test

Standalone ESP‑IDF project that ramps all four motors from 10% to 100% throttle in 5% increments, holding each level for 2 seconds. Used to verify motor wiring, PWM output, and the `motor` driver before integrating with the full flight controller.

---

## Directory layout

```
motor_tests/
├── main/
│   ├── main.c          Ramp-up test — 10% → 100% all motors, 2 s per step
│   ├── motor.c/.h      Brushed motor driver (shared with flight_control and drone_ble)
│   └── slow_decay_test.c   Alternate slow-decay braking test (swap into build if needed)
├── CMakeLists.txt
├── sdkconfig.ci        CI build config (ESP32-C3, I2C pins for DevKit-RUST-1 board)
└── README.md           This file
```

---

## Prerequisites

**ESP‑IDF v5.x** — https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/

Source the environment before building:

```bash
. $HOME/esp/esp-idf/export.sh
```

---

## Build and flash

```bash
cd motor_tests

# Set target chip (first time only — our board is ESP32-C3)
idf.py set-target esp32c3

# (Optional) adjust motor GPIO pins
idf.py menuconfig

# Build only (no board needed — good for a quick compile check)
idf.py build

# Build + flash + open serial monitor
idf.py -p /dev/ttyUSB0 flash monitor
```

Replace `/dev/ttyUSB0` with your port (`COMx` on Windows, `/dev/cu.*` on macOS).

> **Linux port access:** `sudo chmod a+rw /dev/ttyUSB0` if you get permission denied.

---

## Default motor GPIO pins

Set in `motor.h` / `Kconfig.projbuild`. Defaults match the team's wiring on the ESP32-C3 DevKit.

| Motor | PWM pin | DIR pin |
|-------|---------|---------|
| M1 | GPIO 0 | GPIO 1 |
| M2 | GPIO 3 | GPIO 4 |
| M3 | GPIO 5 | GPIO 6 |
| M4 | GPIO 7 | GPIO 9 |

To change pins: `idf.py menuconfig` → **Motor Configuration**.

---

## Expected serial output

```
I (123) motor_test: All motors at 10% (duty=102)
I (2123) motor_test: All motors at 15% (duty=153)
I (4123) motor_test: All motors at 20% (duty=204)
...
I (38123) motor_test: All motors at 100% (duty=1023)
I (40123) motor_test: Done
```

Each step holds for 2 seconds. If a motor does not spin at a given step, check its PWM and DIR wiring against the pin table above.

---

## ⚠️ Safety

- **Remove propellers** before running any motor test.
- Hold the drone frame down or secure it — all four motors will spin simultaneously.
- The test ramps up to 100% throttle. Be ready to power off quickly.
