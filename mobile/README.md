# Mobile app — Expo / React Native

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
| `__tests__/smoke.test.ts` | Protocol constants load correctly (`DroneCmd.ARM === 0x01`, etc.) |
| `__tests__/telemetry-parse.test.ts` | Telemetry parser: JSON format, TEL key=value format, GPS field aliases, edge cases |

---

## Running the app with Expo Go (mock mode)

Expo Go does not load native modules (`react-native-ble-plx`, `react-native-wifi-reborn`), so the app automatically falls back to mock implementations. Telemetry and scan results are simulated.

```bash
npx expo start
```

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

```bash
npx eas build --platform ios --profile development
```

- Builds in the cloud and produces an `.ipa`.
- Install it on your iPhone via the Expo dashboard or TestFlight.
- You will need an [Expo account](https://expo.dev/) (free).

---

## Environment variables

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
