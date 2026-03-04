export type WifiNetworkSummary = {
  id: string;
  ssid: string;
  signalStrength?: number; // 0-100 or RSSI
  secured: boolean;
};

export type WifiScanOptions = {
  timeoutMs?: number;
};

export interface DroneWifiClient {
  scan(options?: WifiScanOptions): Promise<WifiNetworkSummary[]>;
  connect(networkId: string, password?: string): Promise<void>;
  disconnect(): Promise<void>;
  /** Sync; may be stale. Call refreshConnectionStatus() to update. */
  getConnectedNetworkId(): string | null;
  /** Async; fetches current WiFi SSID and updates cache. */
  refreshConnectionStatus(): Promise<void>;
}
