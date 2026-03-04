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

export * from "./types";
