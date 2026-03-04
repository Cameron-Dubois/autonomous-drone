/**
 * BLE-based DroneComms adapter. Connects the DroneComms interface to the real BLE client.
 */

import type { DroneComms } from "./comms";
import type { Command, Telemetry } from "../protocol/types";
import { getBleClient, getStoredDeviceId, setStoredDeviceId } from "./BLE";

const DEFAULT_TELEMETRY: Telemetry = {
  link: "DISCONNECTED",
  batteryPct: 0,
  batteryMins: 0,
  speedKmh: 0,
  altM: 0,
  rssiBars: 0,
  followMode: false,
};

/**
 * Parse telemetry from BLE payload. Supports:
 * - JSON: {"batteryPct":84,"speedKmh":42,"altM":128,...}
 * - TEL format: TEL t=12345 alt=12.3 batt=84 rssi=-50 spd=42 follow=1
 */
function parseTelemetryPayload(payload: string, link: Telemetry["link"]): Partial<Telemetry> {
  const result: Partial<Telemetry> = { link };

  // Try JSON first
  try {
    const data = JSON.parse(payload) as Record<string, unknown>;
    if (typeof data.batteryPct === "number") result.batteryPct = Math.round(data.batteryPct);
    if (typeof data.batteryMins === "number") result.batteryMins = Math.round(data.batteryMins);
    if (typeof data.speedKmh === "number") result.speedKmh = Math.round(data.speedKmh);
    if (typeof data.altM === "number") result.altM = Math.round(data.altM);
    if (typeof data.rssiBars === "number")
      result.rssiBars = Math.max(0, Math.min(4, Math.round(data.rssiBars))) as Telemetry["rssiBars"];
    if (typeof data.followMode === "boolean") result.followMode = data.followMode;
    return result;
  } catch {
    // Fall back to TEL format: TEL t=12345 alt=12.3 batt=84 rssi=-50 spd=42 follow=1
  }

  const parts = payload.replace(/^TEL\s+/i, "").split(/\s+/);
  for (const p of parts) {
    const [key, val] = p.split("=");
    const v = parseFloat(val);
    if (key === "alt" && !isNaN(v)) result.altM = Math.round(v);
    if (key === "batt" && !isNaN(v)) result.batteryPct = Math.round(v);
    if (key === "spd" && !isNaN(v)) result.speedKmh = Math.round(v);
    if (key === "rssi" && !isNaN(v)) {
      // Map RSSI dBm to 0-4 bars: -50=4, -60=3, -70=2, -80=1, -90=0
      const bars = v >= -50 ? 4 : v >= -60 ? 3 : v >= -70 ? 2 : v >= -80 ? 1 : 0;
      result.rssiBars = bars as Telemetry["rssiBars"];
    }
    if (key === "follow" && (val === "1" || val === "true")) result.followMode = true;
  }

  if (result.batteryMins == null && result.batteryPct != null) {
    result.batteryMins = Math.round((result.batteryPct / 100) * 30);
  }

  return result;
}

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
        const patch = parseTelemetryPayload(payload, "SECURE_LINK");
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
        return; // Silently no-op when disconnected
      }
      const message = JSON.stringify(cmd);
      await client.sendCommand(message);
    },

    subscribeTelemetry(cb: (t: Telemetry) => void): () => void {
      listeners.add(cb);
      cb(lastTelemetry);
      updateConnectionState();
      return () => listeners.delete(cb);
    },
  };
}

