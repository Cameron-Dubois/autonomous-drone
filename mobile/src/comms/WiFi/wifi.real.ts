import { Platform } from "react-native";
import type {
  WifiNetworkSummary,
  WifiScanOptions,
  DroneWifiClient,
} from "./types";

// Lazy import to avoid loading in Expo Go when native module isn't available
let WifiManager: typeof import("react-native-wifi-reborn").default | null = null;

function getWifiManager() {
  if (WifiManager) return WifiManager;
  try {
    WifiManager = require("react-native-wifi-reborn").default;
    return WifiManager;
  } catch {
    throw new Error(
      "WiFi requires a development build. Run 'npx expo run:android' or 'npx expo run:ios'."
    );
  }
}

function isSecured(capabilities: string): boolean {
  if (!capabilities) return false;
  const c = capabilities.toUpperCase();
  return (
    c.includes("WPA") ||
    c.includes("WEP") ||
    c.includes("WPS") ||
    c.includes("PSK") ||
    c.includes("EAP")
  );
}

// Convert RSSI level (-100 to -30 dBm) to 0-100
function levelToStrength(level: number): number {
  if (level >= -50) return 100;
  if (level >= -60) return 80;
  if (level >= -70) return 60;
  if (level >= -80) return 40;
  if (level >= -90) return 20;
  return 0;
}

export class RealDroneWifiClient implements DroneWifiClient {
  private _cachedSsid: string | null = null;

  async refreshConnectionStatus(): Promise<void> {
    this._cachedSsid = await this.getCurrentNetwork();
  }

  async scan(options?: WifiScanOptions): Promise<WifiNetworkSummary[]> {
    const mgr = getWifiManager();

    if (Platform.OS === "ios") {
      // iOS does not allow WiFi scanning - only current network
      return [];
    }

    try {
      const list = await mgr.reScanAndLoadWifiList();
      const seen = new Map<string, WifiNetworkSummary>();
      for (const entry of list) {
        const ssid = (entry.SSID || "").replace(/^"|"$/g, "").trim();
        if (!ssid || ssid === "<unknown ssid>") continue;
        const existing = seen.get(ssid);
        const strength = levelToStrength(entry.level);
        if (!existing || strength > (existing.signalStrength ?? 0)) {
          seen.set(ssid, {
            id: ssid,
            ssid,
            signalStrength: strength,
            secured: isSecured(entry.capabilities || ""),
          });
        }
      }
      return Array.from(seen.values());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("locationPermissionMissing") || msg.includes("locationServicesOff")) {
        throw new Error("Location permission and services required for WiFi scan.");
      }
      throw e;
    }
  }

  async connect(networkId: string, password?: string): Promise<void> {
    const mgr = getWifiManager();
    const ssid = networkId;
    const isWEP = false;
    const isHidden = false;

    if (Platform.OS === "ios") {
      await mgr.connectToProtectedWifiSSID({
        ssid,
        password: password ?? null,
        isWEP,
        isHidden,
      });
    } else {
      await mgr.connectToProtectedSSID(ssid, password ?? null, isWEP, isHidden);
    }
    await this.refreshConnectionStatus();
  }

  async disconnect(): Promise<void> {
    if (Platform.OS === "ios") {
      throw new Error("WiFi disconnect is not supported on iOS. Use Settings to disconnect.");
    }
    const mgr = getWifiManager();
    await mgr.disconnect();
    this._cachedSsid = null;
  }

  getConnectedNetworkId(): string | null {
    return this._cachedSsid;
  }

  async getCurrentNetwork(): Promise<string | null> {
    try {
      const mgr = getWifiManager();
      const ssid = await mgr.getCurrentWifiSSID();
      return ssid && ssid.trim() ? ssid.replace(/^"|"$/g, "").trim() : null;
    } catch {
      return null;
    }
  }
}
