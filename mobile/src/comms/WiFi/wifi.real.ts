import { Linking, Platform } from "react-native";
import type {
  WifiNetworkSummary,
  WifiScanOptions,
  DroneWifiClient,
  WifiDisconnectResult,
} from "./types";

// Lazy import to avoid loading in Expo Go when native module isn't available
let WifiManager: typeof import("react-native-wifi-reborn").default | null = null;

function getWifiManager(): NonNullable<typeof WifiManager> {
  if (WifiManager) return WifiManager;
  try {
    const mod = require("react-native-wifi-reborn").default;
    WifiManager = mod;
    return mod;
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
  /** Android: from native `connectionStatus()` (SSID can still be null while this is true). */
  private _androidWifiAssociated = false;

  isWifiAssociated(): boolean {
    if (Platform.OS === "android") {
      return this._androidWifiAssociated || this._cachedSsid != null;
    }
    return this._cachedSsid != null;
  }

  async refreshConnectionStatus(): Promise<void> {
    if (Platform.OS === "android") {
      const mgr = getWifiManager();
      try {
        this._androidWifiAssociated = await mgr.connectionStatus();
      } catch {
        this._androidWifiAssociated = false;
      }
      if (!this._androidWifiAssociated) {
        this._cachedSsid = null;
        return;
      }
      this._cachedSsid = await this.getCurrentNetwork().catch(() => null);
      return;
    }

    this._androidWifiAssociated = false;
    this._cachedSsid = await this.getCurrentNetwork().catch(() => null);
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

  async disconnect(): Promise<WifiDisconnectResult> {
    const mgr = getWifiManager();
    const ssid = this._cachedSsid;

    if (Platform.OS === "ios") {
      const target = ssid ?? (await this.getCurrentNetwork().catch(() => null));
      if (target) {
        try {
          await (mgr as { disconnectFromSSID: (p: string) => Promise<void> }).disconnectFromSSID(
            target
          );
        } catch (e) {
          return {
            disconnected: false,
            reason: "error",
            message: e instanceof Error ? e.message : "iOS disconnect failed",
          };
        }
      }
      this._cachedSsid = null;
      this._androidWifiAssociated = false;
      return { disconnected: true };
    }

    // Android 10+: only networks this app joined via `WifiNetworkSpecifier` can be torn down here.
    // System-managed networks (joined from Settings) cannot be disconnected by an app.
    try {
      await mgr.forceWifiUsageWithOptions(false, { noInternet: false });
    } catch {
      try {
        await mgr.forceWifiUsage(false);
      } catch {
        /* ignore */
      }
    }

    let nativeError: string | null = null;
    try {
      await mgr.disconnect();
    } catch (e) {
      nativeError = e instanceof Error ? e.message : String(e);
    }

    if (ssid) {
      try {
        await mgr.isRemoveWifiNetwork(ssid);
      } catch {
        /* non-fatal */
      }
    }

    // Verify: if the OS still reports an association, the app does not own this network.
    let stillAssociated = false;
    try {
      stillAssociated = await mgr.connectionStatus();
    } catch {
      stillAssociated = false;
    }

    if (stillAssociated) {
      this._androidWifiAssociated = true;
      this._cachedSsid = await this.getCurrentNetwork().catch(() => null);
      return {
        disconnected: false,
        reason: "systemManaged",
        message:
          nativeError ??
          "Android only lets apps disconnect networks they joined themselves. Use the Wi‑Fi panel to disconnect this network.",
      };
    }

    this._cachedSsid = null;
    this._androidWifiAssociated = false;
    return { disconnected: true };
  }

  async openSystemWifiSettings(): Promise<void> {
    if (Platform.OS === "android") {
      const mgr = getWifiManager() as unknown as { openWifiSettings?: () => void };
      try {
        if (typeof mgr.openWifiSettings === "function") {
          mgr.openWifiSettings();
          return;
        }
      } catch {
        /* fallback below */
      }
    }
    await Linking.openSettings();
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
