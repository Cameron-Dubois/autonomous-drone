# Mobile app — Expo / React Native

Control and telemetry UI for the autonomous drone. Connects over **Bluetooth LE** (commands + telemetry, including hybrid BLE-first routing when enabled) and **Wi‑Fi** (live camera stream and telemetry when using the hybrid stack).

---

## App screens

| Tab | File | Description |
|-----|------|-------------|
| **Home** | `app/(tabs)/index.tsx` | Live telemetry dashboard — link status, battery, altitude, speed, RSSI, follow mode, phone GPS |
| **Connect** | `app/(tabs)/connect/index.tsx` | BLE device scan and Wi‑Fi network selector |
| **Control** | `app/(tabs)/control/index.tsx` | Manual control — D‑pad for individual motors, Takeoff / Land / Hover quick actions |
| **Video** | `app/(tabs)/video/index.tsx` | Live MJPEG stream from the drone's HTTP server (Wi‑Fi only) |

---

## Platform notes before you start

| Scenario | Works? | Notes |
|----------|--------|-------|
| Jest unit tests | Yes | Everywhere — no device, no Expo, just `npm test` |
| TypeScript check | Yes | Everywhere — `npm run typecheck` |
| Expo Go (mock UI) | Yes | iOS Simulator + Android Emulator — BLE/Wi‑Fi use mocks |
| Android dev build | Yes | Real device or emulator — full BLE + Wi‑Fi |
| iOS dev build — **real iPhone** | Yes | Full BLE + Wi‑Fi |
| iOS dev build — **iOS Simulator** | No | `react-native-ble-plx` and `react-native-wifi-reborn` need real Bluetooth/Wi‑Fi. Use a real device for native comms. |

---

## Quick start

```bash
cd mobile
npm install
npm test          # run automated tests — no device needed
npx expo start    # launch Expo Go dev server (mock mode)
```

---

## Project layout

```
mobile/
├── app/
│   └── (tabs)/
│       ├── _layout.tsx          Tab bar config
│       ├── index.tsx            Home — telemetry dashboard
│       ├── connect/index.tsx    BLE scan + Wi-Fi connect
│       ├── control/index.tsx    Manual control (D-pad, Takeoff/Land)
│       └── video/index.tsx      Live camera stream (Wi-Fi)
├── src/
│   ├── comms/
│   │   ├── comms.ts             DroneComms interface
│   │   ├── ble-comms.ts         BLE adapter (wraps RealDroneBleClient)
│   │   ├── hybrid-comms.ts      BLE-first commands + Wi‑Fi telemetry merge (when enabled)
│   │   ├── wifi-comms.ts        WebSocket telemetry path
│   │   ├── BLE/                 react-native-ble-plx client + mock
│   │   └── WiFi/                react-native-wifi-reborn client + mock
│   ├── context/
│   │   └── CommsContext.tsx     React context — single DroneComms for all tabs
│   ├── hooks/
│   │   └── usePhoneLocation.ts  Foreground GNSS (expo-location)
│   ├── nav/                     Follow-to-phone navigation helpers
│   ├── protocol/
│   │   ├── types.ts             Command IDs, Telemetry type, buildCommandBytes()
│   │   ├── telemetry-parse.ts   Parse TEL and JSON telemetry strings
│   │   └── encode.ts            Encoding helpers
│   ├── state/
│   │   └── droneStore.ts        Global state (expand as needed)
│   ├── stream/
│   │   └── droneStream.ts       Wi-Fi stream URL + drone reachability probe
│   └── theme/
│       └── layout.ts            Spacing, font sizes, radii constants
├── components/                  Shared UI (e.g. ControlButton, Joystick, TelemetryCard)
├── __tests__/                   Jest unit tests (parser, protocol, comms)
├── jest.config.js
├── tsconfig.json
├── package.json
└── eas.json                     EAS cloud build profiles
```

---

## Automated tests

Both test suites run in Node via Jest — **no device, no simulator, no Expo needed**.

```bash
cd mobile
npm install

npm test                  # run all Jest tests
npm run typecheck         # TypeScript type check (tsc --noEmit)
npm run smoke             # typecheck + jest together (good for CI)
```

### What the tests cover

| File | What it tests |
|------|---------------|
| `__tests__/smoke.test.ts` | Protocol constants and HOVER/ARM wire format |
| `__tests__/telemetry-parse.test.ts` | Telemetry parser: JSON, TEL key=value, GPS aliases, edge cases |
| Other `__tests__/*.ts` | Wi‑Fi comms mocks, hybrid behavior, navigation helpers |

---

## Running the app with Expo Go (mock mode)

Expo Go does not load native modules (`react-native-ble-plx`, `react-native-wifi-reborn`), so the app falls back to mock implementations. Telemetry and scan results are simulated.

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` / `a` for Simulator/Emulator. The iOS Simulator is fine for mock mode only.

---

## Running with real drone comms (development build)

You need a **development build** — not Expo Go — for real BLE and Wi‑Fi.

### Android (device or emulator)

```bash
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android
```

### iOS — real iPhone (macOS + Xcode)

```bash
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios
```

Deploy to a **real iPhone** for Bluetooth/Wi‑Fi native modules.

### Cloud build for iOS (no Mac required)

```bash
npx eas build --platform ios --profile development
```

Install the resulting `.ipa` on your device (Expo dashboard or TestFlight). You need an [Expo account](https://expo.dev/) (free tier works).

---

## Environment variables

| Variable | Values | Default | Effect |
|----------|--------|---------|--------|
| `EXPO_PUBLIC_BLE_MOCK` | `0` / `1` | `1` when native lib unavailable | Set to `0` to force the real BLE stack in a dev build |

---

## BLE connection flow

1. Open the **Connect** tab and tap **Scan for Devices**.
2. Tap **DroneBLE** (or your firmware’s GATT name) to connect.
3. Discover services/characteristics and subscribe to telemetry where applicable.
4. The **Home** screen updates when the link shows `SECURE_LINK`.

The app persists the device ID for automatic reconnect. When using **hybrid comms**, a periodic **HEARTBEAT** over BLE helps the flight controller’s link-loss watchdog.

---

## Wi‑Fi / video flow

1. Flash `drone_wifi` firmware and note the SSID from `menuconfig`.
2. **Android:** **Connect** tab → Wi‑Fi section → join the drone network.
3. **iOS:** **Settings → Wi‑Fi** → join manually, then return to the app.
4. **Video** tab probes `http://192.168.4.1/` (~2.5 s) and loads MJPEG from `/stream` when available.

---

## Connecting to the drone (reference)

- **BLE commands / telemetry:** flash the BLE-capable flight or bring-up firmware (e.g. `flight_control` / `drone_ble`) and use **Connect** → **DroneBLE**.
- **Wi‑Fi video:** flash `drone_wifi` — see [`../drone_wifi/README.md`](../drone_wifi/README.md).

---

## Contributing

- Keep logic in `src/`; screens stay thin and use `useComms()`.
- New commands: `src/protocol/types.ts` (`DroneCmd` + `Command` union).
- New telemetry: extend `Telemetry` in `types.ts` and parse in `telemetry-parse.ts`.
- Add tests under `__tests__/` and run `npm run smoke` before pushing.
