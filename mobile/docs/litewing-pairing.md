# LiteWing (ESP32-S3) — mobile app pairing and transport

This document is for the **Expo / React Native app** in this folder. It describes how a **LiteWing-class** drone (ESP32-S3, firmware in the **ESP-Drone** / Crazyflie family) is expected to pair with the phone and what the app will implement next (Wi‑Fi join, CRTP over UDP). **Confirm network addresses, UDP ports, and CRTP checksum rules on your exact firmware** the first time you have hardware.

## Wi‑Fi pairing (what users do)

- **SSID pattern:** `LiteWing_` plus a hex identifier (often related to MAC), e.g. `LiteWing_aabbccddeeff`.
- **Default PSK (community / vendor guides):** `12345678` unless changed in firmware.
- **Order:** Join the drone’s soft AP in system Wi‑Fi settings (or via in-app flows where the OS allows), then use the app’s **link / connect** action.

### Android

- Some phones **drop or mis-route** traffic when **mobile data** or **VPN** is on. If control is flaky: disable cellular and VPN, or **airplane mode** with only **Wi‑Fi** on, then reconnect to `LiteWing_*`.
- Disabling **automatic switch to better networks** can help (the AP has no internet).

### iOS

- There is **no full Wi‑Fi scan API** like on Android. Users usually join **`LiteWing_*` in Settings → Wi‑Fi**, then return to the app. Do not assume the app can always discover that SSID by scanning on iOS.

## Transport (stock LiteWing control is not DroneBLE)

- **Protocol:** **CRTP** (same family as ESP-Drone / Crazyflie).
- **Carrier:** **UDP** between the phone (STA) and the drone (AP).
- **Reference:** [ESP-Drone — Communication protocols](https://espressif-docs.readthedocs-hosted.com/projects/espressif-esp-drone/en/latest/communication.html) (CRTP, UDP port table).
- **App:** CRTP framing and 8‑bit checksum for UDP are implemented in **`src/litewing/crtp.ts`** (see unit tests in `__tests__/crtp.test.ts`).

### IP and UDP ports (confirm before hardcoding)

Espressif’s docs show **UDP** usage including **drone port 2390** and an application port **2399**, and an **example** drone IPv4 such as `192.168.43.42`.

Default **host/ports/SSID prefix** for the app live in **`src/litewing/defaults.ts`**. You can override the host and ports at build time with `EXPO_PUBLIC_LITEWING_DRONE_HOST`, `EXPO_PUBLIC_LITEWING_DRONE_PORT`, and `EXPO_PUBLIC_LITEWING_APP_PORT`.

Before baking values into `app.json` / env / code:

- **Drone (or gateway) IPv4** on the AP subnet.
- **Ports** if your build changed them.
- **CRTP checksum** and framing — must match firmware; mismatches cause dropped packets or errors in logs.

## How this relates to the current app

- **BLE:** `src/comms/BLE/**`, `src/comms/ble-comms.ts`, and the **Connect** tab implement the **DroneBLE** style link. Protocol details for that stack: repository root `drone_ble/BLE_PROTOCOL_MOBILE.md`.
- **LiteWing (typical):** **Wi‑Fi + CRTP/UDP** — a **separate** path from BLE. Optional future BLE (e.g. provisioning) would be additional work.

## Hardware bring-up checklist (for developers)

1. Confirm **SSID / password** for your firmware build.
2. From monitor or docs, confirm **UDP endpoints** and **CRTP** behavior.
3. After Wi‑Fi join, verify **link** with a small test (e.g. link/ping CRTP if supported) before arming.
4. Record final **IP/ports** in env or a small in-repo note so defaults stay correct.

## Links

- [CircuitDigest — Start Flying With LiteWing](https://circuitdigest.com/articles/start-flying-with-litewing)
- [CircuitDigest — LiteWing wiki](https://circuitdigest.com/wiki/litewing/)
- [ESP-Drone — Communication](https://espressif-docs.readthedocs-hosted.com/projects/espressif-esp-drone/en/latest/communication.html)
- [Bitcraze — CRTP](https://www.bitcraze.io/documentation/repository/crazyflie-firmware/master/functional-areas/crtp/)
