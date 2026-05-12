export type WifiNetworkSummary = {
  id: string;
  ssid: string;
  signalStrength?: number; // 0-100 or RSSI
  secured: boolean;
};

export type WifiScanOptions = {
  timeoutMs?: number;
};

export type WifiDisconnectResult = {
  /** True when the OS no longer reports an active Wi‑Fi association after the call. */
  disconnected: boolean;
  /**
   * Reason the disconnect could not complete in-app. On Android 10+, only networks
   * joined by this app (via WifiNetworkSpecifier) can be torn down; system-managed
   * networks (e.g. home Wi‑Fi joined via Settings) must be disconnected by the user
   * in the Wi‑Fi panel.
   */
  reason?: "systemManaged" | "platformUnsupported" | "error";
  message?: string;
};

export interface DroneWifiClient {
  scan(options?: WifiScanOptions): Promise<WifiNetworkSummary[]>;
  connect(networkId: string, password?: string): Promise<void>;
  disconnect(): Promise<WifiDisconnectResult>;
  /** Open the system Wi‑Fi settings panel (Android) / Settings app (iOS fallback). */
  openSystemWifiSettings(): Promise<void>;
  /** Sync; may be stale. Call refreshConnectionStatus() to update. */
  getConnectedNetworkId(): string | null;
  /**
   * True when the OS reports an active Wi‑Fi association.
   * On Android this uses `connectionStatus()` so it still works when SSID is hidden or `getCurrentWifiSSID` fails.
   */
  isWifiAssociated(): boolean;
  /** Async; fetches current WiFi SSID and updates cache. */
  refreshConnectionStatus(): Promise<void>;
}
