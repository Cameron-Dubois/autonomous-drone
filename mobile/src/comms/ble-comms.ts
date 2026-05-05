/**
 * BLE-based DroneComms adapter. Connects the DroneComms interface to the real BLE client.
 */

import type { DroneComms } from "./comms";
import { buildCommandBytes, createDefaultTelemetry, type Command, type Telemetry } from "../protocol/types";
import { parseBleTelemetryPayload } from "../protocol/telemetry-parse";
import { getBleClient, getStoredDeviceId, setStoredDeviceId } from "./BLE";

const DEFAULT_TELEMETRY: Telemetry = createDefaultTelemetry();

function mergeTelemetry(prev: Telemetry, patch: Partial<Telemetry>): Telemetry {
  return { ...prev, ...patch };
}

export function createBleComms(): DroneComms {
  const listeners = new Set<(t: Telemetry) => void>();
  let lastTelemetry: Telemetry = { ...DEFAULT_TELEMETRY };
  let telemetryUnsub: (() => void) | null = null;

  const emit = (t: Telemetry) => {
    lastTelemetry = t;
    for (const cb of listeners) cb(t);
  };

  const startBleTelemetryIfConnected = () => {
    try {
      const client = getBleClient();
      if (!client.getConnectedDeviceId()) return;
      if (telemetryUnsub) telemetryUnsub();
      telemetryUnsub = client.subscribeTelemetry((payload) => {
        const patch = parseBleTelemetryPayload(payload, "SECURE_LINK");
        emit(mergeTelemetry(lastTelemetry, patch));
      });
    } catch {
      // BLE not initialized (e.g. Expo Go) or not connected
    }
  };

  const updateConnectionState = () => {
    try {
      const client = getBleClient();
      const connected = client.getConnectedDeviceId() != null;
      emit(
        mergeTelemetry(lastTelemetry, {
          link: connected ? "SECURE_LINK" : "DISCONNECTED",
        })
      );
      if (connected) startBleTelemetryIfConnected();
    } catch {
      // BLE not initialized (e.g. Expo Go)
      emit(mergeTelemetry(lastTelemetry, { link: "DISCONNECTED" }));
    }
  };

  return {
    async connect(deviceId?: string): Promise<void> {
      const client = getBleClient();
      const id = deviceId ?? getStoredDeviceId();
      if (!id) {
        throw new Error("No device selected. Go to the Connect tab to scan and connect.");
      }
      emit(mergeTelemetry(lastTelemetry, { link: "CONNECTING" }));
      await client.connect(id);
      setStoredDeviceId(id);
      updateConnectionState();
      startBleTelemetryIfConnected();
    },

    async disconnect(): Promise<void> {
      if (telemetryUnsub) {
        telemetryUnsub();
        telemetryUnsub = null;
      }
      try {
        const client = getBleClient();
        await client.disconnect();
      } catch {}
      emit(mergeTelemetry(lastTelemetry, { link: "DISCONNECTED" }));
    },

    async send(cmd: Command): Promise<void> {
      const client = getBleClient();
      if (!client.getConnectedDeviceId()) {
        return;
      }
      const bytes = buildCommandBytes(cmd);
      await client.sendCommand(bytes);
    },

    subscribeTelemetry(cb: (t: Telemetry) => void): () => void {
      listeners.add(cb);
      cb(lastTelemetry);
      updateConnectionState();
      return () => listeners.delete(cb);
    },
  };
}
