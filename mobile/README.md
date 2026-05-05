# Mobile app — Expo / React Native

<<<<<<< HEAD
Control and telemetry UI for the autonomous drone. Connects to the drone over **Bluetooth LE** (commands + telemetry) and **Wi‑Fi** (live camera stream).

---

## ⚠️ Platform notes before you start

| Scenario | Works? | Notes |
|----------|--------|-------|
| Jest unit tests | ✅ Everywhere | No device, no Expo, just `npm test` |
| TypeScript check | ✅ Everywhere | `npm run typecheck` |
| Expo Go (mock UI) | ✅ iOS Simulator + Android Emulator | BLE/Wi‑Fi use mocks — no real drone comms |
| Android dev build | ✅ Real device or emulator | Full BLE + Wi‑Fi |
| iOS dev build — **real iPhone** | ✅ | Full BLE + Wi‑Fi |
| iOS dev build — **iOS Simulator** | ❌ | `react-native-ble-plx` and `react-native-wifi-reborn` require real Bluetooth/Wi‑Fi hardware. The Simulator has neither. Build for a real device instead. |

---

## Quick start

```bash
cd mobile
npm install
npm test          # run automated tests — no device needed
npx expo start    # launch Expo Go dev server (mock mode)
```
=======
Control and telemetry UI for the autonomous drone project. The app connects to the drone over **Bluetooth LE** for commands and telemetry, and over **Wi‑Fi** to view the live camera stream.

---

## App screens

| Tab | File | Description |
|-----|------|-------------|
| **Home** | `app/(tabs)/index.tsx` | Live telemetry dashboard — link status, battery, altitude, speed, RSSI, follow mode, phone GPS |
| **Connect** | `app/(tabs)/connect/index.tsx` | BLE device scan and Wi‑Fi network selector |
| **Control** | `app/(tabs)/control/index.tsx` | Manual control — D‑pad for individual motors, Takeoff / Land / Hover quick actions |
| **Video** | `app/(tabs)/video/index.tsx` | Live MJPEG stream from the drone's HTTP server (Wi‑Fi only) |
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b

---

## Project layout

```
mobile/
├── app/
│   └── (tabs)/
<<<<<<< HEAD
│       ├── _layout.tsx          Tab bar config
│       ├── index.tsx            Home — telemetry dashboard
│       ├── connect/index.tsx    BLE scan + Wi-Fi connect
│       ├── control/index.tsx    Manual control (D-pad, Takeoff/Land)
│       └── video/index.tsx      Live camera stream (Wi-Fi)
├── src/
│   ├── comms/
│   │   ├── comms.ts             DroneComms interface
│   │   ├── ble-comms.ts         BLE adapter (wraps RealDroneBleClient)
│   │   ├── BLE/                 react-native-ble-plx client + mock
│   │   └── WiFi/                react-native-wifi-reborn client + mock
│   ├── context/
│   │   └── CommsContext.tsx     React context — single DroneComms for all tabs
│   ├── hooks/
│   │   └── usePhoneLocation.ts  Foreground GNSS (expo-location)
│   ├── protocol/
│   │   ├── types.ts             Command IDs, Telemetry type, buildCommandBytes()
│   │   ├── telemetry-parse.ts   Parse TEL and JSON telemetry strings
│   │   └── encode.ts            Encoding helpers
│   ├── state/                   Global state (reserved for expansion)
│   ├── stream/
│   │   └── droneStream.ts       Wi-Fi stream URL + drone reachability probe
│   └── theme/
│       └── layout.ts            Spacing, font sizes, radii constants
├── components/                  Shared UI components
├── __tests__/
│   ├── smoke.test.ts            Protocol constants smoke test
│   └── telemetry-parse.test.ts  Full telemetry parser unit tests
├── jest.config.js
├── tsconfig.json
├── package.json
└── eas.json                     EAS cloud build profiles
=======
│       ├── _layout.tsx       Tab bar layout and navigation config
│       ├── index.tsx         Home / telemetry screen
│       ├── connect/          BLE scan + Wi-Fi connect screen
│       ├── control/          Manual control screen
│       └── video/            Live video screen
├── src/
│   ├── comms/
│   │   ├── comms.ts          DroneComms interface (connect / disconnect / send / subscribe)
│   │   ├── ble-comms.ts      BLE adapter that implements DroneComms
│   │   ├── BLE/              react-native-ble-plx client and mock
│   │   └── WiFi/             react-native-wifi-reborn client and mock
│   ├── context/
│   │   └── CommsContext.tsx  React context — provides DroneComms to the whole app
│   ├── hooks/
│   │   └── usePhoneLocation.ts  Foreground GNSS via expo-location
│   ├── protocol/
│   │   ├── types.ts          Command IDs, Telemetry type, buildCommandBytes()
│   │   ├── telemetry-parse.ts  Parses TEL and JSON telemetry strings
│   │   └── encode.ts         Encoding helpers
│   ├── state/
│   │   └── droneStore.ts     (reserved for global state expansion)
│   ├── stream/
│   │   └── droneStream.ts    Wi-Fi stream URL builder and drone reachability probe
│   └── theme/
│       └── layout.ts         Shared spacing, font sizes, radii, and panel dimension helpers
├── components/
│   ├── ControlButton.tsx     Reusable styled button
│   ├── Joystick.tsx          Analog joystick component
│   └── TelemetryCard.tsx     Telemetry display card
└── __tests__/                Jest unit tests (telemetry parser, protocol encoding)
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b
```

---

<<<<<<< HEAD
## Automated tests

Both test suites run in Node via Jest — **no device, no simulator, no Expo needed**.
=======
## Running the app
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b

```bash
cd mobile
npm install
<<<<<<< HEAD

npm test                  # run all Jest tests
npm run typecheck         # TypeScript type check (tsc --noEmit)
npm run smoke             # typecheck + jest together (good for CI)
```

### What the tests cover

| File | What it tests |
|------|---------------|
| `__tests__/smoke.test.ts` | Protocol constants load correctly (`DroneCmd.ARM === 0x01`, etc.) |
| `__tests__/telemetry-parse.test.ts` | Telemetry parser: JSON format, TEL key=value format, GPS field aliases, edge cases |

---

## Running the app with Expo Go (mock mode)

Expo Go does not load native modules (`react-native-ble-plx`, `react-native-wifi-reborn`), so the app automatically falls back to mock implementations. Telemetry and scan results are simulated.
=======
```

### Expo Go (no BLE / Wi‑Fi — mock mode only)
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b

```bash
npx expo start
```

<<<<<<< HEAD
Scan the QR code with the Expo Go app on your iOS or Android device, or press `i` to open the iOS Simulator / `a` for Android Emulator.

> The iOS Simulator works fine in mock mode. It will not work once you build with real BLE/Wi‑Fi.

---

## Running with real drone comms (development build)

You need a **development build** — not Expo Go — for real BLE and Wi‑Fi.

### Android (device or emulator)

```bash
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android
```

- Works on a physical Android device and on the Android Emulator (emulator has limited BLE support).
- First run takes a few minutes to compile native code.

### iOS — real iPhone only

```bash
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios
```

- Requires **macOS** with **Xcode** installed.
- Must deploy to a **real iPhone** — the iOS Simulator does not expose Bluetooth or Wi‑Fi hardware to apps using these native modules.
- First run will prompt you to select a connected device.

### iOS — cloud build via EAS (no Mac required)
=======
BLE and Wi‑Fi native modules are not available in Expo Go. The app automatically uses mock implementations when the native libs are absent.

### Development build with real BLE and Wi‑Fi

```bash
# Android (device or emulator)
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android

# iOS (macOS + Xcode required)
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios
```

### Cloud build for iOS (no Mac required)
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b

```bash
npx eas build --platform ios --profile development
```

<<<<<<< HEAD
- Builds in the cloud and produces an `.ipa`.
- Install it on your iPhone via the Expo dashboard or TestFlight.
- You will need an [Expo account](https://expo.dev/) (free).
=======
Install the resulting `.ipa` on your device, then run it.
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b

---

## Environment variables

<<<<<<< HEAD
| Variable | Values | Default | Effect |
|----------|--------|---------|--------|
| `EXPO_PUBLIC_BLE_MOCK` | `0` / `1` | `1` when native lib unavailable | Set to `0` to force the real BLE stack in a dev build |

---

## Connecting to the drone (BLE)

1. Flash `drone_ble` firmware onto the ESP32 (see [`drone_ble/README.md`](../drone_ble/README.md)).
2. In the app, open the **Connect** tab → **Scan for Devices**.
3. Tap **DroneBLE** in the list.
4. The **Home** tab will show `SECURE_LINK` and live telemetry once connected.

The app stores the last device ID so it reconnects automatically on the next launch.

---

## Connecting to the drone (Wi‑Fi / video)

1. Flash `drone_wifi` firmware and note the SSID you set in `menuconfig`.
2. **Android:** use the **Connect** tab → Wi‑Fi section to scan and join the network.
3. **iOS:** go to **Settings → Wi‑Fi** on the iPhone and join the drone's network manually, then return to the app.
4. Open the **Video** tab — it probes `http://192.168.4.1/` every 2.5 s and loads the stream when the drone responds.

---

## Contributing

- All logic is in `src/`. Screens are thin — they read from `useComms()` and call `comms.send()`.
- Add new commands in `src/protocol/types.ts` (both the `DroneCmd` constant and the `Command` union type).
- Add telemetry fields in `src/protocol/types.ts` (`Telemetry` type) and handle them in `src/protocol/telemetry-parse.ts`.
- Write tests in `__tests__/` — the telemetry parser is fully unit-testable without any device.
- Run `npm run smoke` before pushing.
=======
| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `EXPO_PUBLIC_BLE_MOCK` | `0` / `1` | `1` in Expo Go | `0` forces the real BLE stack |

---

## BLE connection flow

1. Open the **Connect** tab and tap **Scan for Devices**.
2. The app scans for BLE devices (no UUID filter) and lists named devices.
3. Tap **DroneBLE** to connect.
4. The app discovers services/characteristics and subscribes to telemetry notifications.
5. The **Home** screen updates live once the link shows `SECURE_LINK`.

The selected device ID is persisted so that subsequent launches reconnect automatically.

---

## Wi‑Fi / video flow

1. On the drone, flash `drone_wifi` firmware and note the configured SSID.
2. Go to the **Connect** tab, find the drone's network in the Wi‑Fi list, and join it.
3. Open the **Video** tab — the app probes `http://192.168.4.1/` every 2.5 s.
4. Once the drone HTTP server responds, the MJPEG stream at `/stream` loads automatically.

On **iOS**, background Wi‑Fi scanning is not supported. Connect to the drone's network manually via the system Settings app, then return to the Video tab.

---

## Running tests

```bash
cd mobile
npm test
```

Tests cover the telemetry parser (`telemetry-parse.ts`) and command encoding (`types.ts`). They use Jest and run without any native modules.
>>>>>>> 7583b375a6abde5c789026c49809f4c988e2231b
