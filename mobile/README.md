# Mobile app (Expo / React Native)

Control and telemetry UI for the autonomous drone project. The app connects to the drone over **Bluetooth LE** for commands and telemetry, and over **Wi‑Fi** to view the live camera stream.

---

## App screens

| Tab | File | Description |
|-----|------|-------------|
| **Home** | `app/(tabs)/index.tsx` | Live telemetry dashboard — link status, battery, altitude, speed, RSSI, follow mode, phone GPS |
| **Connect** | `app/(tabs)/connect/index.tsx` | BLE device scan and Wi‑Fi network selector |
| **Control** | `app/(tabs)/control/index.tsx` | Manual control — D‑pad for individual motors, Takeoff / Land / Hover quick actions |
| **Video** | `app/(tabs)/video/index.tsx` | Live MJPEG stream from the drone's HTTP server (Wi‑Fi only) |

---

## Project layout

```
mobile/
├── app/
│   └── (tabs)/
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
```

---

## Running the app

```bash
cd mobile
npm install
```

### Expo Go (no BLE / Wi‑Fi — mock mode only)

```bash
npx expo start
```

BLE and Wi‑Fi native modules are not available in Expo Go. The app automatically uses mock implementations when the native libs are absent.

### Development build with real BLE and Wi‑Fi

```bash
# Android (device or emulator)
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:android

# iOS (macOS + Xcode required)
EXPO_PUBLIC_BLE_MOCK=0 npx expo run:ios
```

### Cloud build for iOS (no Mac required)

```bash
npx eas build --platform ios --profile development
```

Install the resulting `.ipa` on your device, then run it.

---

## Environment variables

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
