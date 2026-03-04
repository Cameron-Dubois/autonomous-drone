# BLE protocol: mobile app ↔ ESP32 drone

This doc describes how the **Aero Drone** mobile app (React Native + react-native-ble-plx) and the **drone_ble** ESP32 firmware (NimBLE) are meant to work together, and what to change so they can send and receive data for real.

---

## 1. How to test the mobile app for real (no mocks)

You need a **development build** (not Expo Go) so the real BLE stack is used.

### On Windows

1. **Android (easiest)**  
   - In `mobile`, run:
     ```bash
     set EXPO_PUBLIC_BLE_MOCK=0
     npx expo prebuild
     npx expo run:android
     ```
   - Use a real device or emulator with BLE. On the **Connect** tab, tap **Scan for Devices**. Your ESP32 should appear (e.g. as **DroneBLE**). Tap **Connect**.

2. **iOS**  
   - Build in the cloud and install on your iPhone:
     ```bash
     cd mobile
     npx eas build --platform ios --profile development
     ```
   - Install the build and run. Scan and connect to **DroneBLE**.

### UUIDs (must match)

The mobile app uses these UUIDs so they **must** match the GATT service/characteristic in `drone_ble`:

| Role            | UUID (string) |
|-----------------|----------------|
| **Service**     | `59462f12-9543-9999-12c8-58b459a2712d` |
| **Characteristic** | `33333333-2222-2222-1111-111100000000` |

They are defined in:

- **Mobile:** `mobile/src/comms/BLE/ble.real.ts`
- **ESP32:** `drone_ble/main/gatt_svr.c` (`gatt_svr_svc_uuid`, `gatt_svr_chr_uuid`)

The mobile scans **without** a service filter so it can discover the ESP32 even if the firmware currently advertises only the 16‑bit UUID (0x1811). After connection, read/write/notify use the 128‑bit service and characteristic above.

---

## 2. What the mobile app does

- **Scan:** Finds BLE devices (no UUID filter). Look for name **DroneBLE**.
- **Connect:** Connects to the device by ID, then discovers services/characteristics.
- **Send command:** Encodes the command string as **UTF-8 → Base64** and writes to the characteristic (with response).
- **Telemetry:** Subscribes to **notifications** on the same characteristic. Each notification payload is treated as **Base64** and decoded to a UTF-8 string (e.g. `TEL t=... alt=...`).

So the app expects:

1. One GATT service and one characteristic with the UUIDs above.
2. **Writes:** variable-length, Base64-encoded command strings (decoded on the ESP32 to get the real command).
3. **Notifications:** telemetry lines as Base64-encoded UTF-8 strings (the ESP32 should encode before sending).

---

## 3. What the ESP32 firmware does today

In `gatt_svr.c`:

- The **service** and **characteristic** UUIDs already match the mobile (see table above).
- The characteristic is **read / write / notify / indicate**.
- **But:** the value is a **single byte** (`gatt_svr_chr_val`). Writes are limited to 1 byte, and notifications are 1 byte. So the current code cannot handle string commands or string telemetry.

---

## 4. What to change on the ESP32 (for your teammate)

To support the mobile app as implemented:

1. **Variable-length characteristic value**  
   - Replace the single-byte value with a buffer (e.g. 512 bytes or MTU-sized).  
   - In the write callback, read the full `ctxt->om` payload (e.g. with `ble_hs_mbuf_to_flat` or similar) and treat it as:
     - **Base64** → decode to get the command string, **or**
     - **Raw UTF-8** if you agree with the mobile to drop Base64 for commands.
   - Handle commands (e.g. parse and drive motors, start/stop, etc.).

2. **Notifications for telemetry**  
   - Periodically (or on events) build a telemetry string (e.g. `TEL t=12345 alt=12.3 batt=84`) and:
     - Encode as **Base64** (if keeping the current mobile behavior), **or**
     - Send raw UTF-8 if you change the app to match.
   - Call `ble_gatts_chr_updated(val_handle)` (or the notify API you use) so that subscribed centrals (the phone) receive the payload.

3. **Optional: advertise the 128‑bit service UUID**  
   - In `main.c`, the legacy advertiser currently sets `fields.uuids16` to 0x1811 only. To allow the mobile to filter by your custom service in the future, add the 128‑bit service UUID to the advertisement (e.g. `fields.uuids128` and `num_uuids128`). Not required for “scan all + connect to DroneBLE.”

4. **Device name**  
   - The app looks for **DroneBLE** in the scan list. Your firmware already sets this with `ble_svc_gap_device_name_set("DroneBLE")`, so no change needed for discovery.

---

## 5. Quick checklist

| Item | Mobile | ESP32 |
|------|--------|--------|
| Service UUID | `59462f12-9543-9999-12c8-58b459a2712d` | Same in `gatt_svr.c` |
| Characteristic UUID | `33333333-2222-2222-1111-111100000000` | Same in `gatt_svr.c` |
| Write | Base64(command string) | Accept variable-length; decode Base64 → command |
| Notify | Base64(telemetry string) | Encode telemetry string → Base64; notify |
| Device name | Shows “DroneBLE” in list | `ble_svc_gap_device_name_set("DroneBLE")` ✓ |

Once the ESP32 accepts variable-length writes and sends string telemetry (with the same encoding as the app), you can run the app, scan, connect to **DroneBLE**, and send commands and receive telemetry.
