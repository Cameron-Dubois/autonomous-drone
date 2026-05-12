# esp32c3-drone

WiFi-controlled quadcopter firmware for the **ESP32-C3**, written in pure C
on **ESP-IDF**. Designed for low-jitter flight control: 1 kHz cascaded-PID
loop with UDP control link and failsafe disarm.

## Quick start

```bash
# Toolchain (one-time)
. $IDF_PATH/export.sh           # ESP-IDF v5.x recommended

cd esp32c3-drone
idf.py set-target esp32c3
idf.py menuconfig               # optional; sdkconfig.defaults has sane values
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

## Project layout

```
esp32c3-drone/
├── CMakeLists.txt              top-level project file
├── partitions.csv              custom partition table (no OTA yet)
├── sdkconfig.defaults          tuned defaults (CPU 160 MHz, FreeRTOS 1 kHz, ...)
└── main/
    ├── CMakeLists.txt          component manifest
    ├── app_config.h            ★ ALL pins, rates, gains live here
    ├── app_main.c              boot orchestration
    ├── flight_task.{c,h}       1 kHz hot path
    ├── imu.{c,h}               MPU6050 driver
    ├── attitude.{c,h}          complementary-filter estimator
    ├── motors.{c,h}            LEDC PWM driver, brushed-MOSFET friendly
    ├── pid.{c,h}               PID with anti-windup + D-on-measurement
    ├── mixer.{c,h}             X-quad mixer w/ throttle-preserving saturation
    └── wifi_link.{c,h}         SoftAP + UDP control + telemetry
```

## Default pin map

| Function           | GPIO  | Notes                                    |
|--------------------|-------|------------------------------------------|
| Motor 0 (FL, CW)   | 0     |                                          |
| Motor 1 (FR, CCW)  | 1     |                                          |
| Motor 2 (RR, CW)   | **2** | **Strapping pin** — see warning below    |
| Motor 3 (RL, CCW)  | 3     |                                          |
| I²C SDA (IMU)      | 4     |                                          |
| I²C SCL (IMU)      | 5     |                                          |

> ⚠️ **GPIO 2 is a boot-strapping pin on the ESP32-C3.** If a motor is pulled
> high during reset, the chip can latch into download mode. Either move M2
> to GPIO 6/7/10 in `app_config.h`, or guarantee MOSFETs are off at reset
> (gate-to-source pull-down).

The I²C bus expects 4.7 kΩ pull-ups to 3V3 on SDA/SCL.

## Wire format

UDP, port `4242`, packet sent at 50–200 Hz from the ground station. All
fields little-endian.

```c
struct ctrl_pkt {
    uint8_t  magic[2];   // 'D','C'
    uint8_t  version;    // 1
    uint8_t  flags;      // bit0 = arm
    int16_t  throttle;   // 0..1000  (per-mil)
    int16_t  roll;       // -500..500
    int16_t  pitch;      // -500..500
    int16_t  yaw;        // -500..500
    uint32_t seq;
};
```

Telemetry comes back to UDP port `4243` at 50 Hz with attitude, throttle,
arm state, and the most recent flight-loop period in microseconds.

If the link goes silent for **300 ms** (`CTRL_TIMEOUT_MS`) the firmware
disarms — motors fall to 0 and integrators reset.

## Control architecture

```
   stick ──▶ outer P loop ──▶ rate setpoint ──▶ inner PID ──▶ mixer ──▶ motors
              (angle mode)                       (rate)
                                                   ▲
                                          gyro ────┘
                          accel + gyro ──▶ complementary filter ──▶ angle
```

- **Outer loop** (P-only): converts a tilt command in degrees into a rate
  setpoint in deg/s. Tunable via `PID_*_ANGLE_KP` and capped at
  `MAX_RATE_DPS`.
- **Inner loop** (PID): drives the gyro to the rate setpoint. Output is
  combined with throttle in the mixer.
- **Failsafes:** packet timeout → disarm; IMU read error → disarm;
  task watchdog set at 2 s as last-resort.

## Tuning workflow

1. Strap the drone to the bench so it can't take off.
2. Arm with low throttle. Confirm motors spin in the correct direction
   (M0 CW, M1 CCW, M2 CW, M3 CCW). Swap any two motor leads to flip
   direction.
3. **Rate loop first.** With angle-loop gains at 0, raise `PID_*_RATE_KP`
   until small disturbances are damped without oscillation, then add a
   little `KI` for steady-state, then a touch of `KD` for damping.
4. **Then angle loop.** Raise `PID_*_ANGLE_KP` until tilt response is
   crisp without overshoot.
5. Watch telemetry for `loop_us`. It should sit at ~1000 µs ± a few.
   Sustained spikes mean the WiFi/RX path is starving the flight task —
   reduce telemetry rate or move it to a separate task.

## What's not in here yet

Intentional omissions to keep this version small and auditable:

- **OTA**. Add a second `app` slot to `partitions.csv` and pull in
  `esp_https_ota` when you're ready.
- **Magnetometer / GPS**. The complementary filter is yaw-relative;
  add an HMC5883/QMC5883 to get an absolute heading.
- **Battery monitor**. Wire a 1:2 divider into ADC1_CH0 and add a
  low-voltage failsafe in `flight_task.c`.
- **Persistent gain storage**. PIDs init from `app_config.h`; storing
  them in NVS so you can tune over the air is a one-evening change.

## License

Use it however helps you fly.
