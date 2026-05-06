# Mobile navigation module (`src/nav`)

This folder implements **follow-to-phone** navigation on the phone: it merges **phone GNSS** and **drone GNSS** into a single **`NavigationSnapshot`**—a semantic state the UI (and later the flight stack) can consume. It does **not** send stick commands or MAVLink by itself; that mapping is deliberately out of scope until you agree on a firmware contract.

## What it does today

1. **Phone position** — `phone-fix-source.ts` uses Expo foreground location (`watchPositionAsync`) and streams **`PhoneFix`** updates (lat/lon, timestamp, optional accuracy, altitude, heading, speed).
2. **Drone position** — `drone-position-provider.ts` defines a small **`DronePositionProvider`** interface. Implementations push **`DroneFix | null`** (same shape as phone fix for lat/lon/timestamp basics). The shipped **`TelemetryDroneProvider`** adapts any telemetry object that exposes `droneLat`, `droneLon`, and optionally `droneGpsValid`.
3. **Pure logic** — `navigator.ts` takes the latest usable phone + drone fixes and computes:
   - **Distance** (haversine, meters) and **bearing** (true degrees, drone → phone)
   - **`NavigationIntent`**: e.g. waiting for fixes, weak phone GPS, proceed toward phone, arrived within radius, hold
   - **`withinArrival`** with hysteresis so “arrived” does not flicker at the edge
4. **React wiring** — `use-follow-to-phone-navigation.ts` subscribes to the phone source and a drone provider, then re-runs the navigator on every update.

Default hook behavior if you do nothing extra: **real phone GPS** + **`NullDroneProvider`** (always no drone fix), so intents stay in “awaiting drone” until you plug in real telemetry.

## Key types (contract for integrators)

See **`types.ts`**. The main output is:

- **`NavigationSnapshot`** — `intent`, `distancePhoneToDrone_m`, `bearingDroneToPhone_deg`, `phoneFix`, `droneFix`, `withinArrival`, `generatedAtMs`.

Fix freshness and quality:

- Fixes older than **`NavigationConfig.maxFixAgeMs`** are ignored (same rule for phone and drone).
- Optional **`maxPhoneAccuracyM`**: if phone **`accuracyM`** is worse, intent becomes **`WEAK_PHONE_GPS`** (drone accuracy is not filtered the same way today).

## Implementing with your partner’s future GPS code

Your partner’s GPS layer should ultimately produce something the app can turn into **`DroneFix`**:

| Field | Requirement |
|--------|-------------|
| Latitude / longitude | Decimal degrees WGS84, finite, in range |
| Time | **`timestampMs`**: use a consistent clock (epoch ms is fine). `TelemetryDroneProvider` currently stamps with **`Date.now()`** when mapping from telemetry—if you need true GPS time from the drone, extend the mapper to pass it through. |
| Validity | If GPS is invalid, publish **`null`** or set **`droneGpsValid: false`** when using **`TelemetryDroneProvider`**. |

**Minimal integration path:** extend your BLE (or other) telemetry model so it includes `droneLat`, `droneLon`, and optionally `droneGpsValid`, then subscribe with **`TelemetryDroneProvider`** and pass that instance into **`useFollowToPhoneNavigation({ droneProvider })`**.

If the wire format differs, add a thin adapter that implements **`DronePositionProvider`** (`subscribe` only)—keep protocol parsing out of `navigator.ts`.

## Implementing with your future firmware flight stack

Today, **`firmware-command-mapper.ts`** is intentionally empty: the nav module outputs **meaning** (`NavigationSnapshot` / `NavigationIntent`), not low-level commands.

**Recommended next steps on the firmware / protocol side:**

1. **Define the command contract** — e.g. setpoint mode (position hold, velocity toward waypoint), max speed, altitude policy, and failsafe when `WEAK_PHONE_GPS` or stale fixes.
2. **Map intents to FC behavior** — e.g. `PROCEED_TOWARD_PHONE` → guided mode toward (phone lat/lon); `ARRIVED_OR_WITHIN_RADIUS` → loiter or land per product decision; `HOLD` / missing drone fix → explicit hold or disallow arming.
3. **Implement `firmware-command-mapper.ts` (or a sibling module)** — input: `NavigationSnapshot` (+ maybe UI toggles); output: packets your WiFi/BLE stack sends to the drone. **Do not** put flight-critical safety only on the phone; mirror or enforce limits on the FC.
4. **WiFi telemetry source** — `mobile/src/comms/wifi-comms.ts` opens a WebSocket to the drone, parses telemetry text frames, and feeds the same `Telemetry` shape that `TelemetryDroneProvider` consumes. Wire it via `TelemetryDroneProvider(comms)` where `comms` comes from `useComms()`.

## File map

| File | Role |
|------|------|
| `types.ts` | `GpsFix`, `NavigationSnapshot`, `NavigationIntent`, `NavigationConfig` |
| `geo.ts` | Haversine, bearing, lat/lon validation |
| `phone-fix-source.ts` | Expo foreground GPS → `PhoneFix` |
| `drone-position-provider.ts` | `DronePositionProvider`, telemetry adapter, test stubs |
| `navigator.ts` | Pure follow-to-phone evaluation |
| `use-follow-to-phone-navigation.ts` | React hook wiring |
| `firmware-command-mapper.ts` | Placeholder for FC / TX mapping |
| `index.ts` | Public exports |

## Configuration

Override **`DEFAULT_NAV_CONFIG`** via **`useFollowToPhoneNavigation({ config })`** when tuning arrival radius, hysteresis, max phone accuracy, and max fix age.

---

*This README describes the `mobile/src/nav` package as of the repo state when it was written; adjust when BLE schemas or FC commands are finalized.*
