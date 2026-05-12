# Dual BLE + Wi‑Fi demo (TA checklist)

Use the unified **`wifi_gps_softap`** firmware on one ESP32-C3: SoftAP + HTTPS/WSS **and** NimBLE peripheral (`DroneBLE`).

## Recommended order (Android)

1. **Flash** `wifi_gps_softap` (`idf.py -p PORT flash monitor`).
2. In the app **Connect** tab, **join the drone Wi‑Fi** first, then tap through until **WSS** shows on Home (map / drone GPS from Wi‑Fi unchanged).
3. **Scan BLE** and connect to **DroneBLE**. The hybrid layer attaches GATT notifications; GPS JSON still prefers the **WebSocket** `link` state.
4. **Control / ESTOP**: with BLE connected, command bytes go over **BLE** first; if BLE is disconnected, they fall back to the WebSocket (firmware may still ignore WS binary).

## Expected behavior

| Condition | Map / `droneLat` | `tel.link` (Wi‑Fi) | Commands |
|-----------|------------------|--------------------|----------|
| Wi‑Fi only | Yes (WSS or `/gps` poll) | CONNECTING / SECURE_LINK / DISCONNECTED from WS | WebSocket binary |
| Wi‑Fi + BLE | Same GPS source; BLE can duplicate GPS notify | Still from WebSocket only | BLE when connected |

## Rollback (Wi‑Fi-only app path)

In `mobile/src/comms/hybrid-comms.ts`, set `USE_HYBRID_DUAL_LINK` to `false` so `CommsProvider` uses plain `createWifiComms()`.

## Firmware notes

- **Partition table**: `wifi_gps_softap/partitions.csv` enlarges the factory app slot (~2 MB flash image) so BT + Wi‑Fi + mbedTLS fit on a **2 MB** flash ESP32-C3.
- **Motors** on this unified C3 build use **`motor_stub.c`** (no PWM); commands are still accepted over BLE for demos and logs.
