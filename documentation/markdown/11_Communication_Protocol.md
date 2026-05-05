### Communication Protocol

The system uses two wireless channels: **Bluetooth Low Energy (BLE)** for commands and telemetry, and **Wi‑Fi** for high‑bandwidth data such as camera frames. This section describes both channels, the binary command packet format, and the telemetry encoding.

---

#### Channel overview

| Channel | Direction | Used for | Latency / bandwidth |
|---------|-----------|----------|---------------------|
| BLE GATT | Phone → Drone | Commands | Low latency, ~256 B MTU |
| BLE GATT notifications | Drone → Phone | Telemetry | Low latency, ~256 B MTU |
| Wi‑Fi soft‑AP + HTTP | Drone → Phone | Camera frames, video | High bandwidth, not real‑time control |

Control commands and telemetry travel exclusively over BLE. Wi‑Fi is used only when the phone has actively joined the drone's soft‑AP and a high‑bandwidth transfer is needed.

---

#### BLE GATT layout

One service, one characteristic. The same UUIDs must be used in both the mobile app and the ESP32 firmware.

| Role | UUID |
|------|------|
| Service | `59462f12-9543-9999-12c8-58b459a2712d` |
| Characteristic | `33333333-2222-2222-1111-111100000000` |

The characteristic supports **read**, **write with response**, and **notify/indicate**. The phone writes commands and subscribes to notifications for telemetry.

Both commands (phone → drone) and telemetry (drone → phone) are encoded as **Base64 over UTF‑8**. The ESP32 decodes incoming Base64 to get the raw command bytes, and encodes outgoing telemetry strings to Base64 before notifying.

---

#### Command packet format

Commands are binary packets matching the `drone_cmd_t` struct in the ESP32 firmware. Built by `buildCommandBytes()` in `mobile/src/protocol/types.ts`.

```
Byte 0   seq        Rolling sequence number (0–255, wraps)
Byte 1   cmd_id     Command identifier (see table below)
Byte 2   payload_len  Number of payload bytes that follow (0 or more)
Byte 3…  payload    Optional command-specific data
```

##### Command IDs

| ID (hex) | Name | Payload | Description |
|----------|------|---------|-------------|
| `0x00` | NOP | none | No operation |
| `0x01` | ARM | none | Arm the drone (enable motors) |
| `0x02` | DISARM | none | Disarm the drone (disable motors) |
| `0x03` | ESTOP | none | Emergency stop — immediate motor cut |
| `0x10` | SET\_MOTOR\_1 | 1 byte throttle (0–255) | Set motor 1 speed |
| `0x11` | SET\_MOTOR\_2 | 1 byte throttle | Set motor 2 speed |
| `0x12` | SET\_MOTOR\_3 | 1 byte throttle | Set motor 3 speed |
| `0x13` | SET\_MOTOR\_4 | 1 byte throttle | Set motor 4 speed |
| `0x20` | HEARTBEAT | none | Keep-alive ping |
| `0x30` | ASCEND | none | Increase throttle |
| `0x31` | DESCEND | none | Decrease throttle |
| `0x32` | FOLLOW\_TOGGLE | none | Toggle autonomous follow mode |

High-level app commands that do not have a dedicated firmware opcode are mapped at the app layer:

| App command | Mapped to firmware command |
|-------------|---------------------------|
| TAKEOFF | ARM (`0x01`) |
| LAND | DISARM (`0x02`) |
| HOVER | NOP (`0x00`) |
| RETURN\_HOME | NOP (`0x00`) |

---

#### Telemetry encoding

The ESP32 sends telemetry as BLE GATT notifications. The payload is a **Base64-encoded UTF-8 string**. The app decodes the Base64 then parses the resulting string in one of two formats:

- **JSON** — a flat JSON object; preferred for future firmware.
- **TEL key=value** — a space-separated list of `key=value` pairs prefixed with `TEL `.

Both formats are described in full in [Section 10 — GPS and Telemetry](10_GPS_Telemetry.md).

---

#### Connection flow

```
App (Connect tab)
  1. Scan for BLE devices (no UUID filter)
  2. Identify "DroneBLE" in the scan list
  3. Connect by device ID → GATT discovery
  4. Subscribe to notifications on the characteristic
  5. App state transitions: DISCONNECTED → CONNECTING → SECURE_LINK

Drone (drone_ble firmware)
  1. Advertise as "DroneBLE"
  2. Accept incoming connection
  3. Accept characteristic writes (commands)
  4. Send GATT notifications (telemetry) to subscribed central
```

The stored device ID is persisted by the app so that subsequent sessions can reconnect without a manual scan.

---

#### Wi‑Fi channel

The `drone_wifi` firmware runs a **soft access point** (`drone_wifi/softAP`). The phone connects to this network via the Wi‑Fi settings screen in the app, which uses `react-native-wifi-reborn` to scan and join the AP.

Wi‑Fi is used for camera frames and other high-bandwidth data only. All flight control remains on BLE regardless of Wi‑Fi connection state. On iOS, background Wi‑Fi scanning is not available; the user must connect manually via the system Settings app.

---

#### Adding new commands

1. Define a new opcode in `drone_ble/main/bleprph.h` (`drone_cmd_id_t` enum).
2. Handle the new opcode in the GATT write callback in `drone_ble/main/gatt_svr.c`.
3. Add the opcode to `DroneCmd` and `CMD_TYPE_TO_ID` in `mobile/src/protocol/types.ts`.
4. Add the new `Command` union variant to the `Command` type in the same file.
5. Update `buildCommandBytes()` if the new command carries a payload.
