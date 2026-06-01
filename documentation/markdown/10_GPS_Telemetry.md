### GPS and Telemetry

Telemetry is the live aircraft state as presented in the mobile app. For follow-me, the app combines **phone GNSS** (where the user is) with **drone GNSS and heading** (where the aircraft is and which way it faces). This section defines the data model and transports for the **finished product**; the prototype app uses the same schema.

---

#### Telemetry data schema

The app holds one `Telemetry` object (see mobile `protocol/types.ts`). Fields are merged from Wi‑Fi and BLE updates.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `link` | `"DISCONNECTED" \| "CONNECTING" \| "SECURE_LINK"` | App (from **Wi‑Fi WebSocket**) | Local secure link to the drone AP — not overwritten by BLE |
| `batteryPct` | `number` | Drone | Battery level, 0–100 % |
| `batteryMins` | `number` | App (heuristic) | Estimated minutes remaining when firmware does not provide it |
| `speedKmh` | `number` | Drone | Ground speed in km/h |
| `altM` | `number` | Drone | Altitude in metres (baro/GNSS fusion on product FC) |
| `rssiBars` | `0–4` | App | Link quality bars (often from BLE RSSI when present) |
| `followMode` | `boolean` | Drone / app | Autonomous follow active |
| `droneGpsValid` | `boolean` | Drone | `true` when onboard GNSS has a valid fix |
| `droneLat` | `number \| null` | Drone | WGS84 latitude; `null` when no fix |
| `droneLon` | `number \| null` | Drone | WGS84 longitude; `null` when no fix |
| `droneGpsFixQuality` | `number` | Drone | Fix quality (0 = invalid, 1 = GPS, 2 = DGPS, …) |
| `droneGpsSatellites` | `number` | Drone | Satellites in use |
| `droneGpsHdop` | `number \| null` | Drone | Horizontal dilution of precision |
| `droneHeadingDeg` | `number \| null` | Drone | Compass heading, degrees true; `null` if unavailable |

---

#### Telemetry wire formats

The flight controller emits telemetry as a **UTF-8 string**. Over BLE it is **Base64-wrapped** in GATT notifications; over Wi‑Fi it is sent as **plain JSON text** (HTTPS snapshot or WebSocket frames). The app uses one parser for both.

##### JSON format

```json
{
  "batteryPct": 84,
  "altM": 12,
  "speedKmh": 0,
  "rssiBars": 3,
  "followMode": false,
  "droneGpsValid": true,
  "droneLat": 36.9741,
  "droneLon": -122.0308,
  "droneGpsFixQuality": 1,
  "droneGpsSatellites": 8,
  "droneGpsHdop": 1.2,
  "droneHeadingDeg": 182.5
}
```

Accepted GPS aliases: `droneLat` / `dlat`, `droneLon` / `dlon`, `droneGpsValid` / `gpsValid` / `gpsOk`, `droneGpsFixQuality` / `gpsFix` / `fix`, `droneGpsSatellites` / `gpsSats` / `sats`, `droneGpsHdop` / `hdop`.

##### TEL key=value format

```
TEL alt=12 batt=84 spd=0 rssi=-65 follow=0 dlat=36.9741 dlon=-122.0308 gps=1 fix=1 sats=8 hdop=1.2
```

| Key | Maps to | Notes |
|-----|---------|-------|
| `alt` | `altM` | Metres |
| `batt` | `batteryPct` | 0–100 |
| `spd` | `speedKmh` | |
| `rssi` | `rssiBars` | dBm → 0–4 bars |
| `follow` | `followMode` | `1` / `true` = active |
| `dlat` / `dlon` | `droneLat` / `droneLon` | Decimal degrees |
| `gps` / `gpsok` / `gps_ok` / `dv` | `droneGpsValid` | |
| `fix` / `fixq` | `droneGpsFixQuality` | |
| `sats` | `droneGpsSatellites` | |
| `hdop` | `droneGpsHdop` | |

Unknown keys are ignored so older app builds stay compatible.

---

#### Wi‑Fi telemetry transport (primary in dual-link mode)

After joining the drone’s soft access point, the app uses **TLS on port 443**:

| Endpoint | Protocol | Behaviour |
|----------|----------|-----------|
| `GET https://192.168.4.1/gps` | HTTPS | One-shot JSON snapshot |
| `wss://192.168.4.1:443/ws` | Secure WebSocket | Same JSON pushed ~5 Hz |
| `GET https://192.168.4.1/` | HTTPS | Health check |

Default gateway **`192.168.4.1`** is the AP address baked into product firmware. See [Section 11 — Communication Protocol](11_Communication_Protocol.md) for TLS trust and provisioning.

**Semantics**

- No GNSS fix: `droneLat`, `droneLon`, `droneGpsHdop` are JSON **`null`**; `droneGpsValid` is `false`.
- No compass heading: `droneHeadingDeg` is **`null`**.

---

#### BLE telemetry (secondary / merge)

BLE notifications may duplicate GPS and status fields. In **hybrid mode** the app merges BLE patches into `Telemetry` but keeps **`link` from the WebSocket** so the UI reflects Wi‑Fi association state.

---

#### Phone location (GNSS)

The app reads handset position via foreground GNSS (`usePhoneLocation` and the nav module’s phone fix source). Phone coordinates are **shown and used for follow geometry**; they are **not** required to be uploaded to the drone for the prototype follow-mock (product FC may later consume phone position over the link if needed).

| Behaviour | Detail |
|-----------|--------|
| Permission | Foreground “when in use” |
| Update rate | Default ~3 s or 5 m |
| Fields | `lat`, `lon`, `accuracyM`, `timestampMs` |

---

#### Follow-to-phone navigation (app layer)

The `nav` module computes a **NavigationSnapshot** from phone and drone fixes:

- Haversine **distance** and **bearing** (drone → phone)
- **Intent**: awaiting fixes, weak phone GPS, proceed toward phone, arrived, hold, etc.

A **follow controller** maps intents to `NAV_*` flight commands over BLE (see Section 11). Production flight software on the PCB executes those commands with onboard limits; the app does not replace the FC failsafe.

---

#### GPS data flow summary

```
Onboard GNSS + compass
      │  parsed fix / heading
      ▼
Flight controller  ──►  JSON or TEL telemetry
      │                      │
      ├──── WSS (~5 Hz) ──────┼──►  App: parse → Telemetry
      └──── BLE notify ───────┘         (merge; link from WSS)

Phone GNSS
      ▼
Navigation + map UI  ──►  Follow intents  ──►  NAV_* commands (BLE)
```
