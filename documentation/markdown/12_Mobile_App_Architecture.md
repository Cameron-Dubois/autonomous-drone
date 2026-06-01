### Mobile App Architecture

The mobile app is a **React Native (Expo)** application with four tabs. It is the operator console for the finished product: connect to the drone, view fused telemetry, start follow-me, manual override, and video. This section describes structure as **product architecture**; the repository implementation matches this layout.

---

#### Layer overview

```
Screens  (app/(tabs)/*)
    │   telemetry via useComms(); commands via comms.send()
    ▼
CommsProvider  (src/context/CommsContext.tsx)
    │   hybrid DroneComms (default) or Wi‑Fi-only if configured
    ▼
DroneComms  (src/comms/comms.ts)
    │
    ├─ createHybridComms(createWifiComms())   ← default (USE_HYBRID_DUAL_LINK)
    │       │
    │       ├─ Wi‑Fi inner: WSS telemetry, link state, send fallback
    │       └─ BLE merge: notify → parse → merge (strip link from BLE patches)
    │
    ├─ createWifiComms()   — WSS + optional /gps poll
    └─ createBleComms()    — BLE-only (legacy / test)

Protocol  (src/protocol/)  — buildCommandBytes, parseBleTelemetryPayload
Nav       (src/nav/)       — follow-to-phone snapshot (phone + drone GNSS)
Autonomy  (src/autonomy/) — follow-mock: snapshot → NAV_* over BLE
```

---

#### Screens

**Home (`app/(tabs)/index.tsx`)**

- Subscribes to `Telemetry` via `useComms()`.
- Shows link state, battery, altitude, speed, follow indicator.
- **Phone GPS** (`usePhoneLocation`) and **drone GPS** when `droneGpsValid`.
- **Follow-to-phone:** `TelemetryDroneProvider` + `useFollowToPhoneNavigation` → distance, bearing, intent.
- **Follow mock controller:** when user starts follow, maps navigation phase to `NAV_*` commands (`sendBytesBleOnly` in hybrid mode).
- On tab focus, calls `comms.connect()` if link was disconnected (after user joined drone Wi‑Fi on Connect).

**Connect (`app/(tabs)/connect/index.tsx`)**

- **Wi‑Fi:** scan/join drone AP (Android programmatic; iOS manual), factory password, auto-provision unique password, rotate/reset.
- **BLE:** scan for `DroneBLE`, connect, persist device ID; calls `syncBleFromExternalConnection()` on hybrid comms.
- Manual hex/raw BLE command for bench debug.

**Control (`app/(tabs)/control/index.tsx`)**

- D-pad → per-motor or paired `SET_MOTOR` commands.
- Centre **Arm** → `ARM`.
- **Takeoff** → `TAKEOFF` (maps to demo/product takeoff opcode).
- **Land** → `LAND` (maps to ESTOP in current app mapping).
- **Hover** → `HOVER` (maps to ARM + FC hover policy).
- Motor percentage readout for bench testing.

**Video (`app/(tabs)/video/index.tsx`)**

- Probes **`https://192.168.4.1/`** while focused.
- Loads **`https://192.168.4.1/stream`** in a WebView when reachable (MJPEG when FC provides it; placeholder stream acceptable during development).

---

#### CommsProvider and hybrid behaviour

`CommsProvider` constructs **`createHybridComms(createWifiComms())`** when `USE_HYBRID_DUAL_LINK` is true (default).

| Behaviour | Detail |
|-----------|--------|
| Auto-connect on app launch | **No** — user joins AP on Connect, then Home/Connect triggers `connect()` |
| `link` field | Owned by **WebSocket** (CONNECTING → SECURE_LINK → DISCONNECTED) |
| BLE telemetry | Merged into last telemetry; **`link` stripped** from BLE patches |
| `send` / `sendBytes` | **BLE first** if GATT connected; else WebSocket binary |
| `sendBytesBleOnly` | Follow-mock only — no Wi‑Fi fallback |
| BLE heartbeat | Periodic `HEARTBEAT` while BLE attached (hybrid) |
| Cleanup | `disconnect()` on provider unmount |

To force Wi‑Fi-only (no BLE command path), set `USE_HYBRID_DUAL_LINK` to `false` in `hybrid-comms.ts`.

```tsx
const comms = useComms();
await comms.send({ type: "ARM" });
```

---

#### DroneComms interface

| Method | Description |
|--------|-------------|
| `connect(deviceId?)` | Start WSS (and optional BLE device id from Connect) |
| `disconnect()` | Tear down sessions |
| `send(cmd)` | High-level `Command` → binary → transport |
| `subscribeTelemetry(cb)` | Push `Telemetry` updates |
| `sendBytes(bytes)` | Raw command buffer |

Hybrid extension: `syncBleFromExternalConnection()`, `notifyBleDisconnected()`, `sendBytesBleOnly()`.

---

#### Wi‑Fi adapter (`wifi-comms.ts`)

| Item | Value |
|------|--------|
| WSS URL | `wss://192.168.4.1:443/ws` (`buildDroneWsUrl`) |
| Health | `GET https://192.168.4.1/` |
| GPS snapshot | `GET https://192.168.4.1/gps` |
| Parser | Same `parseBleTelemetryPayload` as BLE |
| Reconnect | Exponential backoff 500 ms → 8 s cap |

TLS trust for the drone’s embedded cert is handled via platform config (e.g. Android plugin in the app project).

---

#### BLE adapter (`ble-comms.ts` + `BLE/ble.real.ts`)

- Scan/connect/subscribe to GATT notifications.
- Mock when `EXPO_PUBLIC_BLE_MOCK=1` or native module unavailable (Expo Go).
- Connect tab owns the BLE session; hybrid layer **attaches** to an existing connection for telemetry merge and command send.

---

#### Navigation module (`src/nav/`)

| Piece | Role |
|-------|------|
| `navigator.ts` | Pure logic: distance, bearing, `NavigationIntent`, arrival hysteresis |
| `TelemetryDroneProvider` | Drone fix from `Telemetry` (`droneLat` / `droneLon` / valid flag) |
| `use-follow-to-phone-navigation.ts` | React hook wiring phone + drone fixes |
| `firmware-command-mapper.ts` | **Reserved** — product FC mapping from snapshot to setpoints (not yet in app) |

Follow-mock in `src/autonomy/` is the interim mapper: navigation phase → `NAV_*` opcodes. Production should move safety limits to the FC; the mapper remains a thin intent translator.

---

#### Protocol layer (`src/protocol/`)

| File | Purpose |
|------|---------|
| `types.ts` | `Command`, `Telemetry`, `DroneCmd`, `buildCommandBytes`, `navIntentCommandId` |
| `telemetry-parse.ts` | JSON + `TEL` parsing |
| `encode.ts` | Encoding helpers |

See [Section 11 — Communication Protocol](11_Communication_Protocol.md).

---

#### Phone location

- **`usePhoneLocation`** — Home UI display.
- **`phone-fix-source.ts`** — nav module’s phone watcher (duplicate watcher noted in code; unify in a future revision).

Phone position is **not** uploaded to the drone in the current follow-mock; only `NAV_*` intents are sent.

---

#### Wi‑Fi client utilities

- `src/stream/droneStream.ts` — `https` / `wss` URL builders, `probeDroneReachable`.
- `src/comms/WiFi/wifi.real.ts` — join AP on Android.
- `src/config/drone-defaults.ts` — default SSID/password env overrides.

---

#### Mock and development builds

Expo Go uses BLE/Wi‑Fi mocks. Real radio requires a **development build** with `EXPO_PUBLIC_BLE_MOCK=0` and platform permissions for BLE, location, and local network.
