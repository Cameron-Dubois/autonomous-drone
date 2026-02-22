// initial_mobile_code/src/comms/ble/types.ts

export type BleConnectionStatus = "disconnected" | "scanning" | "connected";

export type BleDeviceSummary = {
  id: string;
  name: string;
  rssi?: number;          // signal strength (optional)
  batteryPct?: number;    // mock-only for now; real BLE usually needs a battery service/char
};

export type BleScanOptions = {
  timeoutMs?: number;     // how long to scan before stopping
};

export type BleTelemetryCallback = (payload: string) => void;

export interface DroneBleClient {
  /** Start a scan and return a list of devices found by the end of the scan. */
  scan(options?: BleScanOptions): Promise<BleDeviceSummary[]>;

  /** Connect to a device by id. */
  connect(deviceId: string): Promise<void>;

  /** Disconnect if connected. Safe to call anytime. */
  disconnect(): Promise<void>;

  /** Current connected device id (or null). */
  getConnectedDeviceId(): string | null;

  /** Send a command to the drone. */
  sendCommand(message: string): Promise<void>;

  /** Subscribe to telemetry. Returns an unsubscribe function. */
  subscribeTelemetry(cb: BleTelemetryCallback): () => void;
}