// initial_mobile_code/src/comms/ble/index.ts

import type { DroneBleClient } from "./types.ts";
import { MockDroneBleClient } from "./ble.mock";

// Expo automatically inlines EXPO_PUBLIC_ variables at build time,
// so we access it via globalThis to avoid needing Node types.
const env =
  (globalThis as any).process?.env?.EXPO_PUBLIC_BLE_MOCK ?? "1";

const useMock = env.toString().toLowerCase() === "1" ||
                env.toString().toLowerCase() === "true";

let clientSingleton: DroneBleClient | null = null;

export function getBleClient(): DroneBleClient {
  if (clientSingleton) return clientSingleton;

  if (useMock) {
    clientSingleton = new MockDroneBleClient();
    return clientSingleton;
  }

  // Real BLE must be loaded lazily to avoid Expo Go bundling native modules.
  throw new Error(
    "Real BLE is not available in this build. Use a dev build + set EXPO_PUBLIC_BLE_MOCK=0."
  );
}

/**
 * Optional helper for later:
 * In a dev build, you can call this once at startup to swap to real BLE.
 */
export async function initRealBleClient(): Promise<void> {
  // Dynamic import so Expo Go doesn't include the native module.
  const mod = await import("./ble.real");
  clientSingleton = new mod.RealDroneBleClient();
}

export * from "./types";