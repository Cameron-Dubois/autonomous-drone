// src/comms/BLE/index.ts

import type { DroneBleClient } from "./types.ts";

let clientSingleton: DroneBleClient | null = null;

export function getBleClient(): DroneBleClient {
  if (clientSingleton) return clientSingleton;
  throw new Error(
    "BLE not initialized. Call initRealBleClient() at app startup."
  );
}

export async function initRealBleClient(): Promise<void> {
  const mod = await import("./ble.real");
  clientSingleton = new mod.RealDroneBleClient();
}

// Store for reconnect (when Index Connect button is pressed)
let storedDeviceId: string | null = null;

export function setStoredDeviceId(id: string | null): void {
  storedDeviceId = id;
}

export function getStoredDeviceId(): string | null {
  return storedDeviceId;
}

/** Serialize concurrent reconnect attempts from hybrid send + UI. */
let reconnectPromise: Promise<boolean> | null = null;

/**
 * Ensures the app has an active GATT session when we still know the last device id
 * (set from the Connect tab). OS "Bluetooth connected" is not enough — react-native-ble-plx
 * must run connectToDevice + service discovery or getConnectedDeviceId() stays null and
 * hybrid comms falls through to Wi‑Fi (flight_control never sees ARM).
 */
export async function ensureBleConnected(): Promise<boolean> {
  const client = getBleClient();
  if (client.getConnectedDeviceId()) return true;
  const id = getStoredDeviceId();
  if (!id) return false;

  if (!reconnectPromise) {
    reconnectPromise = client
      .connect(id)
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        reconnectPromise = null;
      });
  }
  const ok = await reconnectPromise;
  return ok === true && client.getConnectedDeviceId() != null;
}

export * from "./types";
