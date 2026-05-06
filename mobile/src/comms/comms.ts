import type { Command, Telemetry } from "../protocol/types";

export type TelemetryCallback = (t: Telemetry) => void;
export type Unsubscribe = () => void;

export interface DroneComms {
  connect(deviceId?: string): Promise<void>;
  disconnect(): Promise<void>;
  send(cmd: Command): Promise<void>;
  /**
   * Low-level escape hatch: ship an already-built command packet.
   * Used while firmware command IDs/payloads are still in flux so call sites
   * can drive `buildRawCommandBytes(...)` without going through the typed `send()` façade.
   */
  sendBytes(bytes: Uint8Array): Promise<void>;
  subscribeTelemetry(cb: TelemetryCallback): Unsubscribe;
}
