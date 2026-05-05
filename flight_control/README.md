# flight\_control — ESP32 flight loop firmware

Full flight control loop running at **100 Hz** on an ESP32. Reads the ICM‑42670‑P IMU, runs a complementary filter for attitude estimation, runs three independent PID controllers (pitch / roll / yaw), and mixes the outputs into per‑motor PWM duty cycles.

The motor API is intentionally identical to `drone_ble` so that the BLE GATT layer can be dropped in without changes.

---

## Directory layout

```
flight_control/
├── main/
│   ├── main.c          Entry point — init, loop, sensor fusion, PID, mixing
│   ├── icm42670p.c/.h  ICM-42670-P I2C driver
│   ├── pid.c/.h        Single-axis PID with anti-windup and output clamping
│   ├── motor.c/.h      Brushed motor driver (LEDC PWM, 0–1023 duty range)
│   ├── main_imu_test.c Standalone IMU smoke-test (swap into CMakeLists to use)
│   └── Kconfig.projbuild  IMU GPIO / I2C address menuconfig options
└── CMakeLists.txt
```

---

## Build and flash

```bash
. $HOME/esp/esp-idf/export.sh
cd flight_control
idf.py set-target esp32          # first time only
idf.py menuconfig                # set SDA/SCL pins and IMU address if needed
idf.py -p /dev/ttyUSB0 flash monitor
```

### IMU wiring options (`menuconfig → IMU Configuration`)

| Option | Default | Notes |
|--------|---------|-------|
| `CONFIG_IMU_I2C_SDA_GPIO` | 21 | I2C data pin |
| `CONFIG_IMU_I2C_SCL_GPIO` | 22 | I2C clock pin |
| `CONFIG_IMU_AD0_HIGH` | off | Set if AD0 is pulled to VCC (I2C addr 0x69 instead of 0x68) |

---

## Control loop

The main loop runs every **10 ms** (100 Hz), driven by `vTaskDelay`.

```
icm42670p_read()
      │
      ▼
Complementary filter  (α = 0.98)
  angle = α × (angle + gyro × dt)  +  (1−α) × accel_angle
      │
      ▼
PID compute — pitch, roll, yaw
      │
      ▼
X-quad motor mixing
  M1 = throttle + pitch + roll − yaw
  M2 = throttle + pitch − roll + yaw
  M3 = throttle − pitch + roll + yaw
  M4 = throttle − pitch − roll − yaw
      │
      ▼
motor_set_speed() × 4   (duty 0–1023, LEDC PWM)
```

### Sensor fusion

A **complementary filter** blends the gyroscope integral (fast, drifts) with the accelerometer-derived angle (slow, noisy) using α = 0.98. This gives a stable attitude estimate without the complexity of a full Kalman filter.

### PID parameters (defaults in `main.c`)

| Axis | P | I | D | Output limit | Integral limit |
|------|---|---|---|-------------|----------------|
| Pitch | 1.5 | 0.0 | 0.3 | ±100 | ±50 |
| Roll  | 1.5 | 0.0 | 0.3 | ±100 | ±50 |
| Yaw   | 1.0 | 0.0 | 0.0 | ±100 | ±50 |

Setpoint for all three axes is **0° / 0 dps** (level hover). Tune P and D first; I is intentionally zero until the physical drone is airborne.

### Motor mixing (X-quad configuration)

Motors are numbered front-left to back-right in the standard X pattern:

```
   M1 (FL, CW)    M2 (FR, CCW)
         [drone body]
   M3 (BL, CCW)   M4 (BR, CW)
```

PID outputs are scaled to the 0–1023 duty range before mixing. `clamp_duty()` ensures no motor receives a value outside `[MIN_DUTY, MAX_DUTY]`.

---

## Motor API

Defined in `motor.h`. The same API is used by `drone_ble` so commands from the mobile app map directly.

| Function | Description |
|----------|-------------|
| `motors_init()` | Configure LEDC channels and GPIO, all motors off |
| `motor_set_speed(motor, duty)` | Set PWM duty 0–1023 |
| `motor_increase_speed(motor, amount)` | Relative increase (clamped) |
| `motor_decrease_speed(motor, amount)` | Relative decrease (clamped) |
| `motor_set_on_off(motor, bool)` | Enable / disable a motor |
| `motor_set_direction(motor, bool)` | Reverse direction (forward = true) |
| `motors_stop_all()` | Immediately zero all four motors |

---

## IMU driver

The `icm42670p` driver communicates over I2C using `driver/i2c_master`. Key details:

- Reads all 14 data bytes in one burst (accelerometer XYZ + gyroscope XYZ + temperature).
- Default config: gyro ±2000 dps at 100 Hz, accel ±16 g at 100 Hz, both in low-noise mode.
- Verifies `WHO_AM_I` (expected `0x67`) on init; returns `ESP_ERR_NOT_FOUND` if the IMU is absent or mis-wired.

---

## Bench testing

`TEST_THROTTLE` is set to **0** by default. Motors will not spin unless you raise this value or call `motor_set_on_off()` explicitly. The loop still runs and prints attitude + PID output to the serial monitor at 10 Hz so you can validate sensor fusion and PID response before any props are attached.

Serial output format (every 10th loop tick):

```
P:  +0.4 R:  -1.2 | PID p: +0.6 r: -1.8 y: +0.0 | M:    0    0    0    0
```
