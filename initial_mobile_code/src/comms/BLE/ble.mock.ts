
import type {
  BleDeviceSummary,
  BleScanOptions,
  BleTelemetryCallback,
  DroneBleClient,
} from "./types";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const MOCK_DEVICES: BleDeviceSummary[] = [
  { id: "mock-001", name: "AERO-DRONE", rssi: -48, batteryPct: 84 },
  { id: "mock-002", name: "Drone-ABC123", rssi: -62, batteryPct: 71 },
];

export class MockDroneBleClient implements DroneBleClient {
  private connectedId: string | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryCb: BleTelemetryCallback | null = null;

  async scan(options?: BleScanOptions): Promise<BleDeviceSummary[]> {
    // Simulate scanning delay
    const timeoutMs = options?.timeoutMs ?? 1200;
    await sleep(timeoutMs);

    // Return a fresh copy each time (avoid accidental mutation)
    return MOCK_DEVICES.map((d) => ({ ...d }));
  }

  async connect(deviceId: string): Promise<void> {
    const found = MOCK_DEVICES.some((d) => d.id === deviceId);
    if (!found) {
      throw new Error(`Mock BLE: device not found: ${deviceId}`);
    }

    // Simulate connection delay
    await sleep(600);
    this.connectedId = deviceId;

    // Start telemetry stream automatically after connect
    this.startTelemetry();
  }

  async disconnect(): Promise<void> {
    if (this.connectedId === null) return;

    await sleep(250);
    this.connectedId = null;
    this.stopTelemetry();
  }

  getConnectedDeviceId(): string | null {
    return this.connectedId;
  }

  async sendCommand(message: string): Promise<void> {
    if (!this.connectedId) {
      throw new Error("Mock BLE: not connected");
    }

    // Simulate write delay + echo back an ack telemetry line
    await sleep(80);
    this.telemetryCb?.(`ACK:${message}`);
  }

  subscribeTelemetry(cb: BleTelemetryCallback): () => void {
    this.telemetryCb = cb;

    // Return unsubscribe
    return () => {
      if (this.telemetryCb === cb) {
        this.telemetryCb = null;
      }
    };
  }

  private startTelemetry() {
    this.stopTelemetry();

    // Emit a pretend telemetry payload ~2Hz
    this.telemetryTimer = setInterval(() => {
      if (!this.connectedId) return;

      const t = Date.now();
      // Keep it simple: you can change this format later
      const payload = `TEL t=${t} alt=12.3 batt=${this.getBattery()} rssi=${this.getRssi()}`;
      this.telemetryCb?.(payload);
    }, 500);
  }

  private stopTelemetry() {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  private getBattery(): number {
    const dev = MOCK_DEVICES.find((d) => d.id === this.connectedId);
    return dev?.batteryPct ?? 0;
  }

  private getRssi(): number {
    const dev = MOCK_DEVICES.find((d) => d.id === this.connectedId);
    return dev?.rssi ?? -99;
  }
}