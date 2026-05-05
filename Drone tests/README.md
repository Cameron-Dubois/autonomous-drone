# Drone tests — Arduino / PlatformIO hardware test suite

Eight hardware tests for the ESP32-C3 + motor driver board. Each test is a standalone Arduino sketch that uploads independently. Run them in order when bringing up a new board or verifying wiring after hardware changes.

**These tests require the physical drone hardware** — ESP32-C3, motor driver (DRV8833), and four brushed DC motors. There is no simulation mode.

---

## Hardware required

| Part | Notes |
|------|-------|
| ESP32-C3 DevKitC | Target board for all tests |
| 4× Brushed DC motor | Connected via DRV8833 driver |
| Motor pinout | M1: PWM=4 DIR=3 · M2: PWM=1 DIR=5 · M3: PWM=2 DIR=0 · M4: PWM=18 DIR=19 |
| USB cable | For flashing and serial monitor |

> **⚠️ Remove propellers before running any test.**

---

## Prerequisites

Install **PlatformIO** using one of these methods:

**Option A — VS Code extension (recommended):**
1. Open VS Code.
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search **PlatformIO IDE** and install it.
4. Restart VS Code.

**Option B — CLI:**
```bash
pip install platformio
```

---

## Setup

1. Open the `Drone tests/` folder in VS Code (open the folder itself, not the repo root).
2. PlatformIO will detect `platformio.ini` automatically.
3. Connect the ESP32-C3 via USB.

---

## Running a test

The test files live in `testfiles/`. **Only one test can be active at a time.** To run a test:

### In VS Code (PlatformIO IDE)

1. Copy the test file you want to run from `testfiles/` into `src/` (create `src/` if it doesn't exist), renaming it to `main.cpp`.
2. Click the **Upload** button (right arrow) in the PlatformIO toolbar.
3. Click the **Serial Monitor** button (plug icon) — baud rate is **115200**.

### From the CLI

```bash
cd "Drone tests"

# Copy the desired test as the active source
cp testfiles/test1_individual_motors.cpp src/main.cpp

# Upload and monitor
pio run --target upload
pio device monitor --baud 115200
```

---

## Test descriptions

| # | File | What it does | Pass condition |
|---|------|-------------|----------------|
| 1 | `test1_individual_motors.cpp` | Spins each motor one at a time in sequence | All 4 motors spin in the correct order |
| 2 | `test2_direction_test.cpp` | Tests CW and CCW direction on all motors | Motors spin in the expected direction for each DIR pin state |
| 3 | `test3_speed_sweep.cpp` | Ramps each motor 0% → 100% → 0% | Smooth speed increase and decrease, no stalls |
| 4 | `test4_hover_balance.cpp` | Sets all four motors to equal throttle | All motors spin at the same speed simultaneously |
| 5 | `test5_serial_control.cpp` | Accepts serial commands: `1` `2` `3` `4` to spin individual motors, `0` to stop all | Correct motor responds to each character |
| 6 | `test6_ramp_test.cpp` | Smooth acceleration and deceleration ramp | No jerky steps; motors reach full speed and return to zero cleanly |
| 7 | `test7_emergency_stop.cpp` | Running motors stop instantly when `x` is sent over serial | All motors cut to zero immediately with no delay |
| 8 | `test8_bluetooth_ready.cpp` | Accepts BLE commands `M1ON`, `M2ON`, … `STOP` | Correct motor responds to each BLE string command |

---

## Serial monitor

All tests print status to the serial port at **115200 baud**. Open the monitor with:

```bash
pio device monitor --baud 115200
```

Or use the VS Code PlatformIO serial monitor button. Press `Ctrl+C` to exit.

---

## `platformio.ini` reference

```ini
[env:esp32-c3-devkitc-02]
platform  = espressif32
board     = esp32-c3-devkitc-02
framework = arduino
monitor_speed = 115200
upload_speed  = 921600
```

If PlatformIO cannot find the board, run `pio update` to refresh the platform index.
