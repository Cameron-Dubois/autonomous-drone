# gps_bringup — Stage A (GPS + compass)

Standalone firmware to validate **UART NMEA GPS** and an **I2C magnetometer** on ESP32-C3 before integrating with BLE or flight code.

## Default wiring (`main/board_config.h`)

| Signal        | ESP32-C3 GPIO | Module pin      |
|---------------|---------------|-----------------|
| GPS UART RX   | GPIO20        | GPS **TX**      |
| GPS UART TX   | GPIO21        | GPS **RX**      |
| I2C SDA       | GPIO10        | GPS compass SDA (same bus as DevKit-RUST-1 `IO10/SDA`) |
| I2C SCL       | GPIO8         | GPS compass SCL (same bus as `IO8/SCL`) |

**ESP32-C3-DevKit-RUST-1:** The board already has **IMU @ 0x68** and **T+H @ 0x70** on that I2C bus. Connect the GPS module’s SDA/SCL to **those same lines** so the bus shows **0x68, 0x70,** and **0x0D** (QMC) when the GPS is wired correctly.
| 3V3, GND      | 3V3, GND      | Power + ground  |

- GPS baud defaults to **9600** (common for UART GPS modules). Change `GPS_BAUD` in `board_config.h` if your module uses 38400/115200.
- On boot, firmware runs a short **I2C bus scan** (logs responding 7-bit addresses) to help identify the compass chip.

## Build / flash / monitor

```bash
cd gps_bringup
idf.py set-target esp32c3
idf.py build flash monitor
```

## Test evidence

Fill in results and screenshots under `documentation/test-documentation-gps-stage-a.md` (same style as `test-documentation.md`).

## Reading the 1 Hz log line

After flashing, each line includes:

- **`uart_rx_B/s`** — bytes received on the GPS UART in the last second.  
  - **~0** → GPS TX is not reaching ESP RX, wrong baud, or module not powered / not sending NMEA.  
  - **Non‑zero but `fix=0` indoors`** → UART is fine; take the module outside / clear sky and wait for a cold start.  
  - **Non‑zero, `gga_cnt` increases, still `valid=0`** → NMEA arriving; often fix quality 0 until outdoors or more satellites.
- **`gga_cnt`** — total `$GPGGA` / `$GNGGA` sentences parsed since boot.

## Troubleshooting

### I2C scan: `devices=0`

Nothing acknowledged SDA/SCL. Check:

1. **SDA and SCL** go to the **compass** pins on the breakout (not swapped with UART).
2. **Common GND** between ESP and GPS board.
3. **Pull-ups** — if the module has no 2.2k–10k pull-ups on SDA/SCL, add **4.7k** from SDA→3V3 and SCL→3V3 (internal ESP pull-ups are often too weak on a breadboard).
4. On **DevKit-RUST-1**, I2C is **GPIO10 (SDA)** and **GPIO8 (SCL)** per silkscreen—match `board_config.h` or edit pins for your board.

### `W (...) i2c: This driver is an old driver...`

You should **not** see this from `gps_bringup` anymore: compass code uses **`driver/i2c_master.h`**. If it appears, you are building an older revision or another component still pulls in the legacy I2C driver.

### Flash size warning (`Detected size(4096k) larger than ... 2048k`)

Your chip has 4 MB flash but the project `sdkconfig` is set to 2 MB; esptool uses the header size. Adjust in `idf.py menuconfig` → Serial flasher if you want the warning gone.
