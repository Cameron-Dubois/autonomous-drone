### Mobile App Architecture

The mobile app is a **React Native (Expo)** application with four tabs. This section describes the internal structure: how screens, contexts, comms adapters, and state are organised and how they depend on each other.

---

#### Layer overview

```
Screens  (app/(tabs)/*)
    │   read telemetry, call comms.send()
    ▼
CommsContext   (src/context/CommsContext.tsx)
    │   provides a single DroneComms instance to the whole app
    ▼
DroneComms interface   (src/comms/comms.ts)
    │   connect / disconnect / send / subscribeTelemetry
    ├──────────────────────────────────────┐
    ▼                                      ▼
Wi‑Fi telemetry adapter (wired in       BLE adapter
CommsProvider today)                     (src/comms/ble-comms.ts)
(src/comms/wifi-comms.ts)                    │
    │                                      ▼
    ▼                              RealDroneBleClient
WebSocket (wss://…)              (src/comms/BLE/ble.real.ts)
parseBleTelemetryPayload             │
on text frames                         ▼
    │                              ESP32 drone_ble (BLE GATT)
    ▼
wifi_gps_softap (HTTPS / WSS :443)
```

---

#### Screens

**Home (`app/(tabs)/index.tsx`)**

Subscribes to telemetry via `useComms().subscribeTelemetry()` and displays:

- Link status (`link` field: connecting / connected / disconnected) and RSSI bars when provided by BLE telemetry
- Battery percentage and estimated minutes remaining
- Altitude and speed
- Follow mode toggle indicator
- Phone GPS position (via `usePhoneLocation`)
- Drone GPS position when a fix is valid

**Connect (`app/(tabs)/connect/index.tsx`)**

Manages BLE device discovery and Wi‑Fi network selection. Calls `comms.connect(deviceId)` on tap and persists the device ID for automatic reconnection. The Wi‑Fi section uses `RealDroneWifiClient` to scan and join the drone's soft‑AP (Android only; iOS requires manual connection via system Settings).

**Control (`app/(tabs)/control/index.tsx`)**

Manual control interface with:

- **D‑pad** — each direction maps to one or two motor commands. Corner presses target individual motors; edge presses target pairs (e.g. N = motors 2+3 for forward pitch).
- **Arm button** (D‑pad centre) — sends `ARM` (`0x01`).
- **Takeoff** — arms the drone then ramps all four motors from 10% to 100% at +5% per second.
- **Land** — sends `DISARM` and zeroes all motors immediately.
- **Hover** — sets all motors to 10% throttle.
- **Motor percentage panel** — live debug readout of each motor's current commanded throttle.

**Video (`app/(tabs)/video/index.tsx`)**

Probes the drone's HTTP server (`GET http://192.168.4.1/`) every 2.5 s while the tab is focused. When reachable, loads the MJPEG stream at `/stream` inside a `WebView` using an inline HTML page (`buildMjpegViewerHtml`). Shows a placeholder with connection guidance otherwise.

---

#### CommsContext

`CommsProvider` (`src/context/CommsContext.tsx`) creates a single `DroneComms` instance with **`createWifiComms()`** (`useMemo`) and calls **`connect()` on mount** so a WebSocket to the drone AP stays up with automatic reconnect. BLE discovery still exists on the Connect tab, but **telemetry and commands through `useComms()` are Wi‑Fi / WSS** unless you change the provider to use `createBleComms()` again.

```tsx
const comms = useComms();   // any screen or component
await comms.send({ type: "ARM" });
```

---

#### DroneComms interface

Defined in `src/comms/comms.ts`. All comms adapters implement this interface, making it easy to swap BLE for Wi‑Fi or a mock without changing any screen code.

| Method | Description |
|--------|-------------|
| `connect(deviceId?)` | Connect to a specific device, or the last stored device |
| `disconnect()` | Tear down the connection |
| `send(cmd)` | Send a `Command` to the drone |
| `subscribeTelemetry(cb)` | Register a callback for telemetry updates; returns an unsubscribe function |
| `sendBytes(bytes)` | Low-level escape hatch: send raw command bytes (used by Wi‑Fi adapter for binary WS frames) |

---

#### BLE adapter (`ble-comms.ts`)

Wraps `RealDroneBleClient` (or a mock when `EXPO_PUBLIC_BLE_MOCK=1` or when the native lib is unavailable). Responsibilities:

- Maintains a listener set for telemetry subscribers.
- On each BLE notification, calls `parseBleTelemetryPayload()` and merges the result into the last known telemetry object before emitting to all listeners.
- Tracks connection state changes and emits a synthetic telemetry patch when the link transitions.

---

#### Wi‑Fi telemetry adapter (`createWifiComms`)

Implemented in `src/comms/wifi-comms.ts`. It implements the same **`DroneComms`** interface as the BLE adapter so screens can stay unchanged when the context wires this adapter instead of BLE.

| Behaviour | Detail |
|-----------|--------|
| Transport | Opens a **WebSocket** to the drone (URL from `options.url` or `buildDroneWsUrl()` in `src/stream/droneStream.ts`) |
| Inbound | **Text** frames only; each payload is split into lines and passed through **`parseBleTelemetryPayload(...)`** (same parser as BLE) |
| Outbound | **`send` / `sendBytes`** encode commands as **raw binary** WebSocket frames (`encodeOutgoingCommand` is identity today); exact framing vs `wifi_gps_softap` command handling is **TBD** |
| Reconnect | Initial delay **500 ms**, doubles each failure up to **8 s** maximum, until `disconnect()` |
| Link state | Sets telemetry `link` to `CONNECTING` → `SECURE_LINK` on open → `DISCONNECTED` on close (same labels as BLE for UI reuse) |

Binary inbound WS frames are ignored until firmware defines a binary telemetry encoding.

---

#### Protocol layer (`src/protocol/`)

| File | Purpose |
|------|---------|
| `types.ts` | `Command` union type, `Telemetry` type, `DroneCmd` opcode constants, `buildCommandBytes()` |
| `telemetry-parse.ts` | Parses `TEL key=value` and JSON telemetry strings into `Partial<Telemetry>` |
| `encode.ts` | Low-level encoding helpers |

See [Section 11 — Communication Protocol](11_Communication_Protocol.md) for the command packet format and telemetry wire formats.

---

#### Phone location hook (`usePhoneLocation`)

Located at `src/hooks/usePhoneLocation.ts`. Requests foreground location permission on first mount and starts a `watchPositionAsync` subscription (default: every 3 s or 5 m). Returns a `PhoneLocationSnapshot` with `lat`, `lon`, `accuracyM`, `timestampMs`, and `error`. Exposes `retryPermission()` to re‑prompt after a denial.

---

#### Wi‑Fi / stream utilities (`src/stream/droneStream.ts`, `src/comms/WiFi/`)

`droneStream.ts` exports constants and helpers for the drone's soft‑AP HTTP server:

- `DRONE_AP_HOST` = `"192.168.4.1"` — ESP‑IDF default soft‑AP gateway
- `buildDroneStreamUrl()` → `"http://192.168.4.1/stream"` (together with `DRONE_HTTP_SCHEME` / `DRONE_HTTP_PORT`)
- `buildDroneWsUrl()` → `"ws://192.168.4.1:81/ws"` (scheme/port/path from module constants)
- `probeDroneReachable(timeoutMs?)` — fetches `GET /` and returns `true` on 200

`RealDroneWifiClient` (`src/comms/WiFi/wifi.real.ts`) wraps `react-native-wifi-reborn` to scan nearby networks and join the drone's AP programmatically (Android). On iOS it returns an empty scan list; users must connect manually.

> **Known mismatch (`wifi_gps_softap` firmware)**  
> `wifi_gps_softap/main/softap_gps_main.c` serves **HTTPS and WSS only on port 443**. The module still defines `DRONE_HTTP_SCHEME = "http"`, `DRONE_HTTP_PORT = 80`, `DRONE_WS_SCHEME = "ws"`, `DRONE_WS_PORT = 81`. Update **`DRONE_HTTP_SCHEME`**, **`DRONE_HTTP_PORT`** (443), **`DRONE_WS_SCHEME`**, **`DRONE_WS_PORT`** (443 or omit port when using defaults), and the helpers **`buildDroneRootUrl`**, **`buildDroneStreamUrl`**, **`buildDroneWsUrl`** so they produce `https://192.168.4.1/…` and `wss://192.168.4.1/ws`.  
> **Self-signed TLS:** production apps must implement explicit trust (e.g. certificate pinning, custom trust manager) or developer-only exceptions — on **iOS**, ATS may block `https://192.168.4.1` unless `NSAppTransportSecurity` allows the exception or pinning is configured; on **Android**, consider Network Security Config or equivalent for user CAs / pinning. See [Section 11 — Communication Protocol](11_Communication_Protocol.md) for cert subject/SAN and verification commands.

---

#### Mock system

Both `BLE/index.ts` and `WiFi/index.ts` export factory functions that return either the real client or a mock depending on whether the native module loads. This allows the app to run in Expo Go without crashing. Set `EXPO_PUBLIC_BLE_MOCK=0` to force the real stack in a development build.
