# BLE protocol: mobile app ↔ wifi_gps_softap firmware

This doc describes how the **Aero Drone** mobile app (React Native + react-native-ble-plx) and the **`wifi_gps_softap`** ESP32 firmware (NimBLE) work together. This is the firmware image flashed for GPS SoftAP demos.

**Canonical sources in this project:**

| Role | Path |
|------|------|
| Command IDs | [`main/bleprph.h`](main/bleprph.h) |
| GATT server + handlers | [`main/gatt_svr.c`](main/gatt_svr.c) |
| Mobile mirror | [`../mobile/src/protocol/types.ts`](../mobile/src/protocol/types.ts) |

---

## 1. How to test the mobile app for real (no mocks)

You need a **development build** (not Expo Go) so the real BLE stack is used.

### On Windows

1. **Android (easiest)**  
   - In `mobile`, run:
     ```bash
     set EXPO_PUBLIC_BLE_MOCK=0
     npx expo prebuild
     npx expo run:android
     ```
   - Use a real device or emulator with BLE. On the **Connect** tab, tap **Scan for Devices**. Your ESP32 should appear as **DroneBLE**. Tap **Connect**.

2. **iOS**  
   - Build in the cloud and install on your iPhone:
     ```bash
     cd mobile
     npx eas build --platform ios --profile development
     ```
   - Install the build and run. Scan and connect to **DroneBLE**.

### UUIDs (must match)

| Role            | UUID (string) |
|-----------------|----------------|
| **Service**     | `59462f12-9543-9999-12c8-58b459a2712d` |
| **Characteristic** | `33333333-2222-2222-1111-111100000000` |

Defined in:

- **Mobile:** `mobile/src/comms/BLE/ble.real.ts`
- **Firmware:** `wifi_gps_softap/main/gatt_svr.c` (`gatt_svr_svc_uuid`, `gatt_svr_chr_uuid`)

---

## 2. Transport

**Commands (phone → drone):** The mobile app writes a **binary frame** to the GATT characteristic. The bytes are wrapped as **Base64** for the BLE write API, but the payload decodes to:

```
[seq: u8][cmd_id: u8][payload_len: u8][payload: 0..16 bytes]
```

**ACK (drone → phone):** On each command write, firmware notifies an ACK frame:

```
[seq][cmd_id][status: u8][drone_ms: u32 LE]
```

**Telemetry (drone → phone):** Firmware notifies **Base64-encoded UTF-8** JSON. The mobile decodes Base64 then parses with `parseBleTelemetryPayload`. Same JSON schema as HTTPS `/gps` and WSS `/ws`.

---

## 3. Command ID table

| ID | Name | Description |
|----|------|-------------|
| `0x00` | `NOP` | Reserved / test |
| `0x01` | `ARM` | Arm motors |
| `0x02` | `DISARM` | Disarm; zero motors |
| `0x03` | `ESTOP` | Emergency stop |
| `0x10` | `SET_MOTOR_1` | Motor 1 throttle (payload: u8 0..255) |
| `0x11` | `SET_MOTOR_2` | Motor 2 throttle |
| `0x12` | `SET_MOTOR_3` | Motor 3 throttle |
| `0x13` | `SET_MOTOR_4` | Motor 4 throttle |
| `0x20` | `HEARTBEAT` | Keep-alive |
| `0x30` | `ASCEND` | High-level (placeholder) |
| `0x31` | `DESCEND` | High-level (placeholder) |
| `0x32` | `FOLLOW_TOGGLE` | High-level (placeholder) |
| `0x33` | `LOST_TOGGLE` | High-level (placeholder) |
| `0x34` | `NAV_ROTATE_CW` | Autonomy intent: rotate toward phone (CW) |
| `0x35` | `NAV_ROTATE_CCW` | Autonomy intent: rotate toward phone (CCW) |
| `0x36` | `NAV_FORWARD` | Autonomy intent: move forward |
| `0x37` | `NAV_STRAFE_LEFT` | Reserved |
| `0x38` | `NAV_STRAFE_RIGHT` | Reserved |
| `0x39` | `NAV_HOLD` | Autonomy intent: hold / standoff band |
| `0x3A` | `NAV_IDLE` | Autonomy intent: idle / stopped |
| `0x3B` | `NAV_BACKWARD` | Autonomy intent: retreat (too close) |
| `0x3C` | `DEMO_TAKEOFF` | **Motor demo:** onboard ramp all motors up then down (DSHOT) |

NAV commands (`0x34`–`0x3B`) and `SET_MOTOR_*` are **log-only** on this bench firmware. Only **`DEMO_TAKEOFF`** drives motors. Mobile Control tab **Takeoff** sends `TAKEOFF` → `0x3C`; **Land** sends `ESTOP`.

---

## 4. Firmware layout

| File | Role |
|------|------|
| `main/bleprph.h` | Command enum, `drone_cmd_t` / `drone_ack_t` |
| `main/gatt_svr.c` | GATT service, parse/write, `drone_handle_command`, telemetry notify |
| `main/ble_stack.c` | NimBLE host, advertising as **DroneBLE** |
| `main/demo_takeoff.c` | Onboard motor ramp task (triggered by `DEMO_TAKEOFF`) |
| `../../motor_tests/main/motor.c` | DSHOT300 on GPIO 3–6 |
| `main/motor_tick_task.c` | Background `motors_tick()` loop |

---

## 5. Demo checklist

1. Flash **`wifi_gps_softap`**: `idf.py -p PORT flash monitor`
2. **Motor proof:** Connect BLE → Control tab → **Takeoff** → serial shows `DRONE_CMD_DEMO_TAKEOFF` + ramp logs; all 4 motors spin up/down
3. **Autonomy proof:** Home → **START FOLLOW** → serial shows `DRONE_CMD_NAV_*` and `SET_MOTOR` (log-only) with no motor motion
