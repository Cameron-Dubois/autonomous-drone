# Autonomous Drone – GPS & Compass Stage A Test Plan

## 1. Purpose

This document defines the **Stage A** bring-up test plan for the ESP32-C3 with an **M10Q-style UART GPS module** and onboard **I2C magnetometer (compass)**.

The goal of this phase is to validate:

- **Test 1:** Apply **3.3 V + GND** and confirm the GPS module is powered (e.g. **power LED on**); optional multimeter for extra credit / rigor
- **Test 2:** **Build and flash** `gps_bringup` and capture baseline serial output
- Correct **signal wiring** (UART GPS, I2C compass) after power is proven
- **NMEA** sentences received and parsed (`$GPGGA` / `$GNGGA`)
- **GPS fix quality** (fix type, satellite count, HDOP, lat/lon when valid)
- **I2C discovery** (bus scan addresses)
- **Compass read path** (QMC5883 @ `0x0D` or HMC5883L @ `0x1E`) and periodic heading logs
- **Serial monitor** as the primary evidence channel (`idf.py monitor`)

This phase intentionally does **not** include BLE, Wi‑Fi, motors, or follow-me logic. Those build on top once this baseline is green.

---

## 2. Test Environment

### Hardware

- ESP32-C3 development board
- M10Q MICRO GPS MODULE WITH COMPASS (or equivalent UART NMEA GPS + I2C compass breakout)
- Breadboard and jumper wires (optional but recommended for first bring-up)
- USB cable to laptop (serial monitor + power)

### Software

- ESP-IDF: ESP-IDF v5.5-dev-3062-ge9bdd39599-dirty
- Firmware path: `gps_bringup/`
- Git branch: gps_bringup

### Tools

- Serial monitor: `idf.py monitor` (baud typically **115200** for console; GPS module UART is separate, default **9600** in `board_config.h` unless your module specifies otherwise)

### Reference wiring (default in firmware)

| Signal     | ESP32-C3 GPIO | Module connection        |
|------------|---------------|---------------------------|
| GPS RX (ESP) | GPIO20      | GPS module **TX**         |
| GPS TX (ESP) | GPIO21      | GPS module **RX**         |
| I2C SDA    | GPIO10        | Compass **SDA** (DevKit-RUST-1: `IO10/SDA`; shared with onboard IMU) |
| I2C SCL    | GPIO8         | Compass **SCL** (`IO8/SCL`; shared with onboard T+H @ 0x70) |
| 3V3 / GND  | 3V3 / GND     | Module power (3.3 V logic) |


---

## 3. Test Cases

Tests below are listed in **recommended execution order** for bring-up and for documentation (e.g. course credit): **Test 1** power + LED proof, **Test 2** build/flash + first logs, then UART/I2C/GPS tests (GPS-A1 onward).

---

### Test 1 — Power on; prove GPS is powered (LED / visual)

**Purpose:**
Show that the **M10Q (or equivalent) GPS module** receives **3.3 V and GND** from the ESP32-C3 (or same 3.3 V rail) and is **actually powered** before connecting UART/I2C or flashing application firmware. The simplest proof for many breakouts is a **power LED** that turns on when VCC is valid.

**Setup:**

- ESP32-C3 and GPS module on breadboard or bench
- USB cable for the ESP32-C3 (powers the dev kit’s 3.3 V rail when plugged in)
- *(Optional)* Multimeter if you want a numeric VCC reading in addition to the LED

**Steps:**

1. With **USB disconnected**, wire **only** power (signal wires optional for this test):
   - Module **VCC** / **3V3** (per silkscreen) → ESP32-C3 **3V3**
   - Module **GND** → ESP32-C3 **GND**
2. Plug in **USB** to power the ESP32-C3.
3. Observe the GPS board: record whether a **power LED** (or other documented “power good” indicator) is **ON**. If your module has **no LED**, state that explicitly and use **optional Step 4** instead.
4. *(Optional)* With a multimeter, measure **DC voltage** from **GND** to module **VCC** and record (expect roughly **3.2–3.4 V** on a nominal 3.3 V rail).
5. Disconnect USB when finished if required by lab procedure.

**Pass Criteria:**

- **GND** is common between ESP32-C3 and GPS module.
- **VCC** is the correct rail for your board (**3.3 V** for 3.3 V logic modules—confirm against datasheet / silkscreen; do not use 5 V on a 3.3 V-only I/O board).
- **Primary pass:** A **power LED** (or stated equivalent visible indicator) is **ON** after applying USB power **or** optional multimeter reading matches a valid 3.3 V supply.

**Evidence to Capture:**

- **Photo** of GPS board with **LED on** (or short video still), with **VCC/GND** wires visible if possible.
- One sentence: **“Power LED observed ON after connecting 3V3 and GND.”** (or **“No LED on this module; used multimeter / continuity only”**).
- *(Optional)* Table: **Date**, **measured VCC (V)**, **board / module names**.

**Results:**

- Test 1 (power + LED / visual proof): *(Pass / Fail)*
- Power LED: *(ON / N/A — no LED on module)*
- GND common: *(Yes / No)*
- Optional measured VCC: *(e.g. 3.31 V / N/A)*
- Notes:

---

### Test 2 — Build and flash `gps_bringup`

**Purpose:**
Confirm the Stage A firmware **builds**, **programs** the ESP32-C3, and produces **serial monitor** output. This is the first software proof after Test 1 shows the GPS hardware is powered.

**Setup:**

- Test 1 complete (GPS powered; LED or meter documented)
- Signal wires connected per **§2 Reference wiring** (UART + I2C as you use for bring-up)
- Clone / open repo at `autonomous-drone`
- ESP-IDF environment loaded in terminal

**Steps:**

1. `cd gps_bringup`
2. `idf.py set-target esp32c3`
3. `idf.py build`
4. `idf.py -p <PORT> flash monitor`

**Pass Criteria:**

- Build completes without errors
- Flash completes without errors

**Evidence to Capture:**

```
I (5303) gps_bringup: GPS valid=0 fix=0 sats=0 hdop=0.0 lat=0.000000 lon=0.000000 | uart_rx_B/s=0 gga_cnt=0 | compass=NONE WAIT heading=0.0 deg
I (6303) gps_bringup: GPS valid=0 fix=0 sats=0 hdop=0.0 lat=0.000000 lon=0.000000 | uart_rx_B/s=0 gga_cnt=0 | compass=NONE WAIT heading=0.0 deg
I (7303) gps_bringup: GPS valid=0 fix=0 sats=0 hdop=0.0 lat=0.000000 lon=0.000000 | uart_rx_B/s=0 gga_cnt=0 | compass=NONE WAIT heading=0.0 deg
I (8303) gps_bringup: GPS valid=0 fix=0 sats=0 hdop=0.0 lat=0.000000 lon=0.000000 | uart_rx_B/s=0 gga_cnt=0 | compass=NONE WAIT heading=0.0 deg
I (9303) gps_bringup: GPS valid=0 fix=0 sats=0 hdop=0.0 lat=0.000000 lon=0.000000 | uart_rx_B/s=0 gga_cnt=0 | compass=NONE WAIT heading=0.0 deg
```

**Results:**

- Build: Pass
- Flash: Pass
- Notes:

---

### GPS-A1 — UART Activity (Raw NMEA Optional)

**Purpose:**
Verify the GPS UART is electrically connected and the module is transmitting.

**Setup:**

- `gps_bringup` flashed, antenna placed with sky view
- Serial monitor open

**Steps:**

1. Power-cycle the board
2. Wait 30–120 seconds outdoors (cold start can take time)
3. Observe periodic `gps_bringup` INFO lines (1 Hz) for `fix` and `sats`

**Pass Criteria:**

- Within a reasonable cold-start window, **satellite count** becomes non-zero **or** fix quality transitions from `0` toward a locked state in open sky
- No repeated UART driver errors in log

**Evidence to Capture:**

- Serial snippet showing `fix=` / `sats=` changing over time
- Optional: photo of wiring + antenna placement

**Results:**

- Time to first `sats > 0`: *(seconds / N/A)*
- Time to `valid=1` with lat/lon: *(seconds / N/A)*
- Notes:

---

### GPS-A2 — Parsed Fix (`$GNGGA` / `$GPGGA`)

**Purpose:**
Confirm firmware parses GGA and exposes lat/lon when fix is valid.

**Setup:**

- Same as GPS-A1, open sky

**Steps:**

1. Watch 1 Hz log line from task `gps_bringup`
2. Record one line where `valid=1` (if achieved)

**Pass Criteria:**

- When `valid=1`, latitude and longitude look plausible for your location (degrees, not stuck at `0.000000` unless truly invalid)
- `hdop` present as a finite float (lower is generally better)

**Evidence to Capture:**

#### Example log line (copy into this doc)

```
I (...) gps_bringup: GPS valid=1 fix=1 sats=.. hdop=.. lat=.. lon=.. | compass=.. OK heading=.. deg
```

**Results:**

- Parsed GGA: *(Pass / Fail)*
- Notes:

---

### GPS-A3 — I2C Bus Scan

**Purpose:**
Document which I2C devices respond (compass chip, optional others).

**Setup:**

- Compass SDA/SCL wired per §2

**Steps:**

1. Reset board
2. In early boot logs, find `compass: I2C scan` lines listing addresses (e.g. `0x0D`, `0x1E`)

**Pass Criteria:**

- At least one expected magnetometer address appears **or** you capture “no devices” and fix wiring / module variant
- Scan completes without I2C driver fault loop

**Evidence to Capture:**

- Copy-paste of full I2C scan section from boot log

**Results:**

- Addresses seen: *(list)*
- Notes:

---

### GPS-A4 — Compass Heading Stream

**Purpose:**
Verify repeated heading samples (uncalibrated magnetic heading) update when you rotate the board on a flat surface.

**Setup:**

- Compass detected (`compass=QMC5883` or `HMC5883L` in log)
- Module away from large metal objects / speakers

**Steps:**

1. Note heading while board points north-ish (rough)
2. Rotate board ~90° on desk, wait 2–3 seconds
3. Repeat for 360° if possible

**Pass Criteria:**

- `compass=... OK` appears regularly (not permanently `WAIT`)
- Heading changes smoothly in the correct *directional* sense (absolute accuracy not required in Stage A)

**Evidence to Capture:**

- Short table: time / heading / physical orientation (optional)
- Optional photo: flat rotation test setup

**Results:**

- Compass type detected: *(QMC5883 / HMC5883L / NONE)*
- Behavior: *(Pass / Fail)*
- Notes:

---

### GPS-A5 — Indoor vs Outdoor (Expectation Check)

**Purpose:**
Record realistic limitations: GPS may not lock indoors; compass may drift near metal.

**Setup:**

- Same firmware

**Steps:**

1. Run indoors 2 minutes — capture `fix` / `valid`
2. Run outdoors 2 minutes — capture `fix` / `valid`

**Pass Criteria:**

- Documented comparison matches expectations (outdoor dramatically better for GPS)

**Results:**

- Indoor: `valid=...`, notes:
- Outdoor: `valid=...`, notes:

---

## 4. Known Limitations (Stage A)

- Heading is **uncalibrated** (no hard/soft-iron calibration); absolute bearing error can be large.
- No automated unit tests in CI yet; evidence is **serial logs + optional photos**.
- Some combo boards use magnetometers not covered here; extend `compass_mag.c` if scan shows a different address.
- GPS UART baud may differ by module; update `GPS_UART_BAUD` in `board_config.h` if NMEA never appears.

---

## 5. Next Phase Testing (Planned)

- Stage B: log **distance + bearing** to a fixed lat/lon (still no motors, or motors on bench with props off)
- Integrate with **`drone_ble`** command layer: telemetry notify + target waypoint write
- Add **checksum-validated NMEA** parsing and additional sentences (RMC/VTG) if needed
- Magnetometer calibration routine + declination (location-based) for better yaw aiding

---

## 6. Conclusion

Completing **Test 1 (power + LED / visual proof)**, **Test 2 (build + flash + baseline logs)**, and **GPS-A1 through GPS-A5** with captured evidence establishes a **repeatable Stage A baseline**: verified supply, firmware on target, UART GPS behavior, I2C compass detection, and stable periodic logging. That baseline is the foundation for BLE-driven follow-me and higher-level flight modes in later documents (`test-documentation.md` and `test-plan.md` cross-links).
