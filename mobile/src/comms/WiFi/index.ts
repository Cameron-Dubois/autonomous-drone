import type { DroneWifiClient } from "./types";
import { RealDroneWifiClient } from "./wifi.real";

let clientSingleton: DroneWifiClient | null = null;

export function getWifiClient(): DroneWifiClient {
  if (clientSingleton) return clientSingleton;
  clientSingleton = new RealDroneWifiClient();
  return clientSingleton;
}

export * from "./types";
