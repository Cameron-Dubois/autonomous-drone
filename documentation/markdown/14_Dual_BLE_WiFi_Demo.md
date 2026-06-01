# Dual BLE + Wi‑Fi operation

This section describes how the **finished product** is intended to be used day-to-day, and how to run a **bench demo** with the current prototype app and firmware. Product behaviour is dual-link; single-link modes exist for debugging only.

---

## Intended product behaviour

| Concern | Channel |
|---------|---------|
| Live telemetry, GPS, map, `link` status | **Wi‑Fi** — `wss://192.168.4.1:443/ws` (and `GET /gps` if needed) |
| Flight commands, follow `NAV_*` intents, heartbeat | **BLE** — GATT to `DroneBLE` |
| Video (when enabled) | **Wi‑Fi** — `https://192.168.4.1/stream` |

The phone joins the drone’s access point **without internet**. BLE remains available for low-latency control even when telemetry is already flowing over Wi‑Fi.

---

## Recommended operator flow (Android)

1. **Power on** the drone; wait for AP and BLE advertise.
2. **Connect** tab — join drone Wi‑Fi (factory password first time; app may provision a unique password and show it once).
3. **Home** — confirm link live and drone GPS when outdoors.
4. **Connect** tab — scan and connect **DroneBLE**.
5. **Control** or **Home (follow)** — commands go over BLE; telemetry continues on WSS.

On **iOS**, join the AP in Settings before step 3; BLE steps are the same.

---

## Expected UI behaviour

| Condition | Map / drone GPS | `tel.link` | Commands |
|-----------|-----------------|------------|----------|
| Wi‑Fi only | Yes (WSS or `/gps`) | From WebSocket | WebSocket fallback |
| Wi‑Fi + BLE | Yes; BLE may duplicate GPS fields | Still from WebSocket | **BLE when connected** |

---

## Debug: Wi‑Fi-only mode

In the app, set `USE_HYBRID_DUAL_LINK` to `false` in `hybrid-comms.ts` so `CommsProvider` uses plain `createWifiComms()` — commands and telemetry both on WSS. Use only for protocol testing; product shipping config keeps hybrid enabled.

---

## Prototype vs product (motors and follow)

| Feature | Product intent | Prototype status |
|---------|----------------|------------------|
| `NAV_*` follow | FC executes with limits | App sends opcodes; bench FC may log only |
| Takeoff | Standard FC sequence | App may use demo takeoff opcode on bench |
| Per-motor BLE throttle | Maintenance / cal mode | May be log-only on unified bench image |
| Video | MJPEG on `/stream` | Placeholder stream acceptable |

These gaps do not change the protocol documented in Section 11; they define remaining FC integration work on the custom PCB.

---

## Manufacturing note

Production units must ship with a **unique AP password** (provisioned once), **embedded TLS identity** trusted by the shipped app build, and BLE pairing consistent with the UUIDs in Section 11.
