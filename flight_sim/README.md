# flight_sim — Hardware-in-the-Loop Quadcopter Simulator

This folder contains a **hardware-in-the-loop (HIL)** test environment that
runs the real flight controller firmware on the ESP32-C3 while replacing the
physical IMU and motors with a Python physics simulation on the PC.

## How it differs from `flight_control/`

| | `flight_control/` | `flight_sim/` |
|---|---|---|
| **Sensors** | Real ICM-42670-P over I2C | Simulated accel/gyro from `bridge.py` over USB serial |
| **Motors** | Real PWM output via DRV8833 | Duty values sent back to `bridge.py` for physics |
| **Sensor fusion** | Identical complementary filter | Identical (copied) |
| **PID controller** | Identical gains and logic | Identical (`pid.c`/`pid.h` copied) |
| **Motor mixer** | Identical X-quad mixer | Identical |
| **Hardware needed** | Full drone assembly | Just the ESP32-C3 dev board plugged in via USB |

The ESP32 firmware in `flight_sim/main/` runs **the exact same** fusion, PID,
and mixer code as the real flight controller. The only difference is the I/O
layer: instead of reading the I2C IMU and writing PWM outputs, it reads
simulated sensor packets from USB serial (`hil_link.c`) and sends motor
commands back.

This means any bug or tuning issue you find in the sim applies directly to the
real firmware.

## What the simulator tests

### Attitude stabilisation (PID loop)
The primary purpose. The Python sim sends accelerometer and gyroscope readings
that reflect the drone's current orientation, and the ESP32 responds with motor
commands. The sim applies those commands to the physics model and feeds the
new sensor state back. This closed loop lets you:
- Tune PID gains (P, I, D for pitch, roll, yaw) without risking hardware.
- Verify the complementary filter tracks angles correctly.
- Check that the X-quad motor mixer produces the right corrections.

### 6-DOF flight dynamics
The physics model simulates full translational motion (x, y, z position and
velocity) on top of rotational dynamics. This tests:
- **Can the drone hover?** With quadratic thrust the required motor duty is
  higher than with a linear model. The sim prints the theoretical hover duty
  at startup so you can compare it to the firmware's `TEST_THROTTLE`.
- **Altitude behaviour** — whether thrust is sufficient to hold altitude or
  the drone sinks.
- **Horizontal drift** — when the drone tilts, thrust has a horizontal
  component and the drone drifts. The sim tracks total drift from the start
  position.

### Battery voltage sag
A resistive model estimates the battery voltage under motor load. At high
duty all four 8520 motors draw significant current from the small LiPo,
causing voltage droop that reduces available thrust. The sim shows whether the
PID can cope with this diminishing thrust.

### Wind and gust disturbances
An Ornstein-Uhlenbeck gust process generates smoothly varying random wind on
top of a configurable constant base wind. Wind creates both a translational
force (via quadratic aerodynamic drag) and a torque (offset from center of
gravity to center of pressure). This tests whether the PID is robust to
external disturbances.

### Gyroscopic precession
Spinning propellers create cross-axis torques when the frame rotates — a
pitch rate produces a roll torque and vice versa. The effect is small on a
micro quad but it is a real coupling that the PID must handle.

### Crash detection
Two crash modes are modelled:
- **Ground impact** — touching down at > 2.0 m/s or with tilt > 60 deg.
- **Mid-air unrecoverable** — extreme tilt while falling with insufficient
  altitude to recover before hitting the ground.
- **Failed launch** — if the drone was airborne (altitude > 0.1 m) and
  contacts the ground with any downward velocity > 0.3 m/s, it is considered
  a crash. This catches insufficient-thrust scenarios where the drone drops
  from its starting altitude.

When a crash is detected a large red **CRASHED** overlay appears on the plot.
Press **R** to reset.

### Motor drop recovery
The "Drop" button (or `D` key) kills all motors for 0.5 seconds and then
restores them, simulating a brief power glitch or ESC brownout. This tests
whether the PID can recover from freefall.

### Startup safety
Physics are frozen until the ESP32 sends its first motor response. This
prevents the drone from free-falling during the serial handshake delay and
eliminates intermittent launch failures caused by the ESP32 needing a few
hundred milliseconds to boot and respond.

### Mass profile switching
Two profiles are built in:
- **minimal (60 g):** ESP32-C3 + DRV8833 + 4 motors + 1S LiPo + frame
- **full (110 g):** adds ESP32-S3, GPS, barometer, second battery, shell

You can switch profiles mid-run (`1`/`2` keys) to check whether PID gains
tuned at 60 g still work at 110 g.

## Architecture

```
┌────────────┐  USB serial  ┌──────────────┐
│  ESP32-C3  │◄────────────►│  bridge.py   │
│            │              │  (PC/Python) │
│  hil_link  │  sensor pkt  │              │
│  pid.c     │◄─────────────│  QuadSim     │
│  main.c    │              │  (6-DOF      │
│  (fusion + │  motor pkt   │   physics)   │
│   mixer)   │─────────────►│              │
└────────────┘              │  matplotlib  │
                            │  (live plot) │
                            └──────────────┘
```

### Serial protocol

Binary packets with XOR checksum, defined in `hil_link.h`:

| Direction | Type byte | Payload | Size |
|---|---|---|---|
| PC → ESP32 | `0x01` | 6 floats: ax, ay, az (g), gx, gy, gz (deg/s) | 24 B |
| ESP32 → PC | `0x02` | 4 uint16 motor duty + 2 floats (pitch, roll deg) | 16 B |

Every packet is framed as `[0xAA] [type] [payload] [checksum]`.

## File layout

```
flight_sim/
├── bridge/
│   ├── bridge.py          # 6-DOF physics sim + serial bridge + plot
│   └── requirements.txt   # pyserial, matplotlib, numpy
├── main/
│   ├── main.c             # ESP32 firmware (fusion + PID + mixer over HIL)
│   ├── pid.c / pid.h      # PID controller (copied from flight_control)
│   ├── hil_link.c / .h    # USB serial packet layer
│   └── CMakeLists.txt
├── CMakeLists.txt
└── sdkconfig.defaults
```

## Running the sim

### 1. Flash the ESP32-C3

```bash
cd flight_sim
idf.py build flash
```

### 2. Run the Python bridge

```bash
cd flight_sim/bridge
pip install -r requirements.txt
python bridge.py --port COM5
```

### CLI options

| Flag | Default | Description |
|---|---|---|
| `--port` | (required) | ESP32 serial port |
| `--baud` | 115200 | Serial baud rate |
| `--profile` | `minimal` | `minimal` (60 g) or `full` (110 g) |
| `--pitch0` | 5.0 | Initial pitch disturbance (deg) |
| `--roll0` | 3.0 | Initial roll disturbance (deg) |
| `--alt0` | 0.5 | Starting altitude (m) |
| `--wind` | 0.0 | Constant wind speed (m/s), 0 = off |
| `--thrust-expo` | 2.0 | Thrust exponent: 1.0 = linear, 2.0 = quadratic |

### Keyboard / button controls

| Key | Button | Action |
|---|---|---|
| Space | Pause | Pause / resume simulation |
| R | Reset | Reset state to initial conditions |
| P | Pitch+10 | Kick pitch +10 deg |
| O | Pitch-10 | Kick pitch -10 deg |
| L | Roll+10 | Kick roll +10 deg |
| K | Roll-10 | Kick roll -10 deg |
| Y | Yaw+30 | Kick yaw rate +30 deg/s |
| W | Wind | Toggle wind on/off |
| G | Gust | One-shot random lateral gust |
| D | Drop | Kill motors for 0.5 s |
| 1 | 60g | Switch to minimal profile |
| 2 | 110g | Switch to full profile |

## Known limitations

- **No propeller aerodynamics** — thrust is a simple power-law function of
  duty, not a blade-element model with advance ratio.
- **No ground effect** — thrust does not increase near the ground.
- **No prop wash interaction** — motors don't affect each other's airflow.
- **Euler angle singularities** — angles are clipped at +/-90 deg rather than
  using quaternions, so extreme acrobatics will break the model.
- **No battery capacity depletion** — voltage sag is modelled but the battery
  never actually drains over time.
- **Simplified inertia** — the moment of inertia is estimated from mass and
  arm length, not from CAD geometry.

## Keeping firmware in sync

`pid.c`, `pid.h`, and the fusion/mixer logic in `main.c` are **copied** from
`flight_control/main/`. If you change PID gains or fusion constants in one
place, update the other to keep the HIL test meaningful.

## What's next

The HIL simulator validates that your firmware can stabilise a quadrotor
in simulation. The next steps toward actual flight:

### 1. Bench test — motors spinning on the frame (no flight)
- Mount 4x 8520 motors on the 3D-printed frame with propellers attached.
- Wire them through the two DRV8833 H-bridge drivers to the ESP32-C3.
- Power from a single 3.7 V 400 mAh LiPo.
- Flash `flight_control` firmware and verify each motor spins in the correct
  direction at the expected duty. Check the X-quad mixer mapping
  (which motor speeds up on a pitch-forward command, etc.).
- Confirm the ICM-42670-P is reading sane values while motors are running
  (vibration levels, bias drift).

### 2. Tethered hover test
- Attach the drone to a string or thin dowel rig that constrains it to
  roughly vertical motion and limits tilt to ~30 deg.
- Set `TEST_THROTTLE` to the hover duty the sim calculated and arm the PID.
- Observe whether it can hold altitude and self-level. If it oscillates,
  lower P/D gains. If it drifts slowly, raise I gain.
- Tune until it hovers stably on the tether for 30+ seconds.

### 3. Free hover (no tether)
- Open space, low ceiling or outdoors with no wind.
- Same firmware, same gains from tether test.
- Hand-launch gently. Goal: 10+ seconds of stable hover at ~0.5 m.
- If it flips on launch, double-check motor direction and prop orientation.

### 4. Add the ESP32-S3 + GPS + barometer
- Wire the S3 as the companion processor (handles GPS waypoints and
  altitude hold via barometer). C3 stays as the inner-loop attitude
  controller.
- Implement altitude-hold PID using BMP280 barometric altitude, feeding
  a throttle setpoint to the C3.
- Implement GPS waypoint following: S3 computes desired pitch/roll angles
  to move toward the target, sends them to C3 as attitude setpoints.

### 5. GPS follow mode
- Pair with a phone or companion device broadcasting its GPS coordinates
  over BLE or a radio link.
- S3 computes bearing and distance to the mobile device, converts to
  pitch/roll setpoints, and the C3 inner loop tracks them.
- Start with slow walking-speed tests in an open field.
