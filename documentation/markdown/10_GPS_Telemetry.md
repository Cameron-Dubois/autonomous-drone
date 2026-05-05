### GPS and Telemetry

This section documents the telemetry data schema and how GPS information is collected and displayed in the system. Telemetry is the live state of the drone as seen by the mobile app; GPS data from both the phone and the drone can be shown together on the map view.

---

#### Telemetry data schema

The mobile app maintains a single `Telemetry` object that is updated whenever a BLE notification arrives from the drone. The type is defined in `mobile/src/protocol/types.ts`.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `link` | `"DISCONNECTED" \| "CONNECTING" \| "SECURE_LINK"` | App | BLE connection state |
| `batteryPct` | `number` | Drone | Battery level, 0–100 % |
| `batteryMins` | `number` | App (heuristic) | Estimated minutes remaining (derived from `batteryPct` when not provided by firmware) |
| `speedKmh` | `number` | Drone | Ground speed in km/h |
| `altM` | `number` | Drone | Altitude in metres |
| `rssiBars` | `0–4` | App | BLE signal strength bars derived from RSSI dBm |
| `followMode` | `boolean` | Drone | Whether autonomous follow mode is active |
| `droneGpsValid` | `boolean` | Drone | `true` when the on‑drone GNSS module has a valid fix |
| `droneLat` | `number \| null` | Drone | Drone latitude, WGS84 decimal degrees; `null` when no fix |
| `droneLon` | `number \| null` | Drone | Drone longitude, WGS84 decimal degrees; `null` when no fix |
| `droneGpsFixQuality` | `number` | Drone | NMEA GGA fix quality (0 = invalid, 1 = GPS, 2 = DGPS, …) |
| `droneGpsSatellites` | `number` | Drone | Number of satellites in use; 0 when unknown |
| `droneGpsHdop` | `number \| null` | Drone | Horizontal dilution of precision; `null` when unknown |

---

#### Telemetry wire formats

The ESP32 encodes telemetry as a UTF‑8 string, Base64‑encodes it, and sends it as a BLE GATT notification. The app decodes Base64, then parses the resulting string using one of two formats.

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
  "droneGpsHdop": 1.2
}
```

Accepted GPS field aliases: `droneLat` / `dlat`, `droneLon` / `dlon`, `droneGpsValid` / `gpsValid` / `gpsOk`, `droneGpsFixQuality` / `gpsFix` / `fix`, `droneGpsSatellites` / `gpsSats` / `sats`, `droneGpsHdop` / `hdop`.

##### TEL key=value format

```
TEL alt=12 batt=84 spd=0 rssi=-65 follow=0 dlat=36.9741 dlon=-122.0308 gps=1 fix=1 sats=8 hdop=1.2
```

| Key | Maps to | Notes |
|-----|---------|-------|
| `alt` | `altM` | Rounded to integer metres |
| `batt` | `batteryPct` | 0–100 |
| `spd` | `speedKmh` | |
| `rssi` | `rssiBars` | Converted: ≥−50 → 4 bars, ≥−60 → 3, ≥−70 → 2, ≥−80 → 1, else 0 |
| `follow` | `followMode` | `1` / `true` = active |
| `dlat` | `droneLat` | Decimal degrees |
| `dlon` | `droneLon` | Decimal degrees |
| `gps` / `gpsok` / `gps_ok` / `dv` | `droneGpsValid` | `1` / `true` / `yes` = valid |
| `fix` / `fixq` | `droneGpsFixQuality` | Non-negative integer |
| `sats` | `droneGpsSatellites` | Non-negative integer |
| `hdop` | `droneGpsHdop` | Float |

Unknown keys are silently ignored, so future firmware can add fields without breaking older app builds.

---

#### Phone location (GNSS)

The mobile app collects the handset's own GPS position using the `usePhoneLocation` hook (`mobile/src/hooks/usePhoneLocation.ts`). This is displayed next to the drone's position on the map view but is **not** transmitted to the firmware.

| Behaviour | Detail |
|-----------|--------|
| Permission | Requests "when in use" foreground permission once on mount |
| Update rate | Default: every 3 seconds or 5 metres (configurable via hook options) |
| Accuracy | `Location.Accuracy.Balanced` |
| Fields | `lat`, `lon`, `accuracyM`, `timestampMs` |
| Errors | Permission denied, location services off, or hardware error are surfaced in `error` field |

The hook exposes a `retryPermission()` callback that the UI can call to re-prompt the user after a denial.

---

#### GPS data flow summary

```
Drone GNSS module
      │  NMEA / parsed fix
      ▼
drone_ble firmware  ──encodes──►  TEL dlat=… dlon=… gps=1 …
                                        │  (Base64 over BLE notification)
                                        ▼
                              parseBleTelemetryPayload()
                                        │
                                        ▼
                                  Telemetry object
                                  (droneLat, droneLon, …)

Phone GNSS hardware
      │  expo-location watchPositionAsync
      ▼
usePhoneLocation hook
      │
      ▼
PhoneLocationSnapshot
(lat, lon, accuracyM)   ──────────────►  Map view (both positions rendered)
```
