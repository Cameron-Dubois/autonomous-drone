### Communication Protocol

The product uses a **dual wireless link** between phone and drone:

| Channel | Role | Rationale |
|---------|------|-----------|
| **Wi‑Fi (TLS)** | Telemetry, GPS JSON, future video | Bandwidth; ~5 Hz state + stream headroom |
| **BLE (GATT)** | Flight commands, optional telemetry merge | Low latency; works when user has joined AP |

The mobile app’s default configuration is **hybrid**: **WebSocket telemetry and `link` state over Wi‑Fi**, **commands prefer BLE** when a GATT session exists, with WebSocket fallback. No internet or cloud service is required.

---

#### Channel overview

| Channel | Direction | Used for |
|---------|-----------|----------|
| BLE GATT write | Phone → drone | Commands (primary) |
| BLE GATT notify | Drone → phone | Telemetry (optional duplicate) |
| HTTPS / WSS on drone AP | Drone → phone | Telemetry, GPS snapshot, health |
| HTTPS / WSS | Phone → drone | Command fallback (binary frames; FC integration product-dependent) |
| HTTPS | Phone → drone | Wi‑Fi provisioning, status |

---

#### BLE GATT layout

One service, one characteristic. Same UUIDs on the custom PCB firmware and in the mobile app.

| Role | UUID |
|------|------|
| Service | `59462f12-9543-9999-12c8-58b459a2712d` |
| Characteristic | `33333333-2222-2222-1111-111100000000` |

Supports **read**, **write with response**, and **notify**. Advertised name: **`DroneBLE`**.

Commands and BLE telemetry use **Base64 over UTF-8** on the wire: the phone encodes binary command bytes; the FC decodes writes and encodes notification payloads.

---

#### Command packet format

Binary layout (phone builds via `buildCommandBytes()`):

```
Byte 0   seq           Rolling sequence (0–255)
Byte 1   cmd_id        Opcode (table below)
Byte 2   payload_len   Payload length (0–16 typical)
Byte 3…  payload       Optional data
```

##### Command IDs

| ID (hex) | Name | Payload | Description |
|----------|------|---------|-------------|
| `0x00` | NOP | none | No operation |
| `0x01` | ARM | none | Arm motors / enable control |
| `0x02` | DISARM | none | Disarm |
| `0x03` | ESTOP | none | Emergency stop |
| `0x10`–`0x13` | SET_MOTOR_1–4 | 1 byte throttle 0–255 | Per-motor setpoint (manual / bench) |
| `0x20` | HEARTBEAT | none | Link keep-alive |
| `0x30` | ASCEND | none | Increase throttle (mode) |
| `0x31` | DESCEND | none | Decrease throttle (mode) |
| `0x32` | FOLLOW_TOGGLE | none | Toggle follow mode |
| `0x33` | LOST_TOGGLE | none | Toggle lost-link behaviour |
| `0x34` | NAV_ROTATE_CW | none | Yaw right (follow) |
| `0x35` | NAV_ROTATE_CCW | none | Yaw left (follow) |
| `0x36` | NAV_FORWARD | none | Translate toward subject |
| `0x37` | NAV_STRAFE_LEFT | none | Lateral left |
| `0x38` | NAV_STRAFE_RIGHT | none | Lateral right |
| `0x39` | NAV_HOLD | none | Hold position / attitude |
| `0x3A` | NAV_IDLE | none | Idle / clear nav intent |
| `0x3B` | NAV_BACKWARD | none | Retreat from subject |
| `0x3C` | DEMO_TAKEOFF | none | Scripted bench takeoff (prototype/demo; product may map to standard takeoff) |

##### High-level app command mapping

| App command | Firmware opcode | Notes |
|-------------|-------------------|--------|
| ARM | `0x01` | |
| DISARM | `0x02` | |
| ESTOP | `0x03` | |
| TAKEOFF | `0x3C` | Product: standard takeoff sequence on FC |
| LAND | `0x03` | App maps to ESTOP for immediate cut; product may use DISARM + land mode |
| HOVER | `0x01` | App maps to ARM + FC hover throttle policy |
| RETURN_HOME | `0x00` | Reserved; product RTH TBD |
| SET_MOTOR | `0x10`–`0x13` | Manual bench / maintenance |
| HEARTBEAT | `0x20` | Sent periodically when BLE connected in hybrid mode |

---

#### Telemetry encoding

See [Section 10 — GPS and Telemetry](10_GPS_Telemetry.md). BLE: Base64-wrapped UTF-8 JSON or `TEL key=value`. Wi‑Fi: plain JSON text on `/gps` and `/ws`.

---

#### Connection flow (typical user session)

```
1. Connect tab — join drone Wi‑Fi (Android in-app; iOS system Settings)
2. Optional: first-time POST /wifi/provision with factory password → unique AP password stored on FC
3. Home / app — open WSS to wss://192.168.4.1:443/ws → link = SECURE_LINK; GPS fields update
4. Connect tab — scan BLE, tap DroneBLE → GATT notify subscribed
5. Control / follow — commands sent on BLE; telemetry may merge from both radios
```

Persisted BLE device ID allows reconnect without a full scan.

---

#### Wi‑Fi access point and TLS

The flight controller runs a **soft AP** (SSID/password from manufacturing or provisioning). All product HTTP/WebSocket services use **TLS on port 443** (no cleartext control on the AP).

| Path | Method | Purpose |
|------|--------|---------|
| `/` | GET | Health |
| `/gps` | GET | One-shot telemetry JSON |
| `/ws` | WebSocket | Streaming telemetry JSON (~5 Hz) |
| `/stream` | GET | Video stream (MJPEG or placeholder until camera enabled) |
| `/wifi/status` | GET | `{ "provisioned", "ssid" }` |
| `/wifi/provision` | POST | First-time password set `{ "password", "factoryPassword" }` |
| `/wifi/rotate-password` | POST | Change AP password (provisioned units) |
| `/wifi/factory-reset` | POST | Restore factory Wi‑Fi credentials |

**WebSocket rules**

- **Single active client** (“last connect wins”) for telemetry.
- **Outbound:** JSON field set per Section 10.
- **Inbound:** Binary/text command frames may be accepted on product FC; hybrid app primarily commands over BLE today.

**TLS trust**

The drone presents a **device-embedded certificate** (e.g. CN for local AP, SAN for AP IP `192.168.4.1`). The mobile app must pin or otherwise trust this cert (Android network security config / iOS ATS exception in development builds). Users see a browser warning if they open `https://192.168.4.1/gps` directly without trust installed.

---

#### Adding or changing commands

1. Add opcode to flight-controller command enum (firmware).
2. Handle opcode in the GATT write path and in the flight-mode / mixer layer with failsafe checks.
3. Add `DroneCmd` and app `Command` type in `mobile/src/protocol/types.ts`.
4. Update `buildCommandBytes()` and any high-level mappings (Control tab, follow controller).

---

#### Relation to prototype builds

Interim bench firmware may **log** `NAV_*` without full closed-loop flight, or expose a **demo takeoff** opcode for tethered tests. The table above is the **product contract** the app and documentation target; production PCB firmware must implement the safety-critical subset (ARM/DISARM/ESTOP, HEARTBEAT timeout, NAV execution with limits) before shipment.
