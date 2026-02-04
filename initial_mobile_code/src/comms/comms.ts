import type { Command, Telemetry } from "../protocol/types";

export type TelemetryCallback = (t: Telemetry) => void;
export type Unsubscribe = () => void;

export interface DroneComms {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(cmd: Command): Promise<void>;
  subscribeTelemetry(cb: TelemetryCallback): Unsubscribe;
}
