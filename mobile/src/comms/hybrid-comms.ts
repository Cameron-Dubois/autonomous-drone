/**
 * Wraps Wi‑Fi `DroneComms` (WSS telemetry + link state) and merges BLE notifications
 * without letting BLE overwrite `link` (WebSocket remains source of truth for link).
 * Commands go over BLE when a GATT connection exists, else fall back to Wi‑Fi WS.
 */
import type { DroneComms, TelemetryCallback } from "./comms";
import { buildCommandBytes, createDefaultTelemetry, type Command, type Telemetry } from "../protocol/types";
import { parseBleTelemetryPayload } from "../protocol/telemetry-parse";
import { getBleClient } from "./BLE";

const BLE_ATTACH_POLL_MS = 900;

function mergeTelemetry(prev: Telemetry, patch: Partial<Telemetry>): Telemetry {
  return { ...prev, ...patch };
}

/** Remove `link` from a telemetry patch so BLE cannot override the Wi‑Fi link state. */
export function stripLinkFromPatch(patch: Partial<Telemetry>): Partial<Telemetry> {
  const { link: _ignored, ...rest } = patch;
  return rest;
}

export type HybridComms = DroneComms & {
  /** Call after Connect tab establishes a BLE session so telemetry notify can attach. */
  syncBleFromExternalConnection(): void;
};

export function createHybridComms(inner: DroneComms): HybridComms {
  const hybridListeners = new Set<TelemetryCallback>();
  let lastTelemetry: Telemetry = createDefaultTelemetry();

  let innerUnsub: (() => void) | null = null;
  let bleUnsub: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const emit = (t: Telemetry) => {
    lastTelemetry = t;
    for (const cb of hybridListeners) cb(t);
  };

  const detachBle = () => {
    if (bleUnsub) {
      bleUnsub();
      bleUnsub = null;
    }
  };

  const tryAttachBleTelemetry = () => {
    try {
      const client = getBleClient();
      if (!client.getConnectedDeviceId()) {
        detachBle();
        return;
      }
      if (bleUnsub) return;
      bleUnsub = client.subscribeTelemetry((payload) => {
        const patch = parseBleTelemetryPayload(payload, "SECURE_LINK");
        const noLink = stripLinkFromPatch(patch);
        emit(mergeTelemetry(lastTelemetry, noLink));
      });
    } catch {
      /* BLE not ready (e.g. Expo Go) */
    }
  };

  const startInnerBridge = () => {
    if (innerUnsub) return;
    innerUnsub = inner.subscribeTelemetry((t) => {
      emit({ ...t });
    });
  };

  const stopInnerBridge = () => {
    if (innerUnsub) {
      innerUnsub();
      innerUnsub = null;
    }
  };

  const startPoll = () => {
    if (pollTimer != null) return;
    pollTimer = setInterval(() => {
      tryAttachBleTelemetry();
    }, BLE_ATTACH_POLL_MS);
  };

  const stopPoll = () => {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const sendBytes = async (bytes: Uint8Array): Promise<void> => {
    try {
      const client = getBleClient();
      if (client.getConnectedDeviceId()) {
        await client.sendCommand(bytes);
        return;
      }
    } catch {
      /* fall through to Wi‑Fi */
    }
    await inner.sendBytes(bytes);
  };

  return {
    connect: (deviceId?: string) => inner.connect(deviceId),
    disconnect: () => inner.disconnect(),
    send: async (cmd: Command) => {
      await sendBytes(buildCommandBytes(cmd));
    },
    sendBytes,

    subscribeTelemetry(cb: TelemetryCallback): () => void {
      hybridListeners.add(cb);
      if (hybridListeners.size === 1) {
        startInnerBridge();
        tryAttachBleTelemetry();
        startPoll();
      } else {
        cb(lastTelemetry);
      }
      return () => {
        hybridListeners.delete(cb);
        if (hybridListeners.size === 0) {
          stopPoll();
          detachBle();
          stopInnerBridge();
        }
      };
    },

    syncBleFromExternalConnection() {
      detachBle();
      tryAttachBleTelemetry();
    },
  };
}

export function isHybridComms(c: DroneComms): c is HybridComms {
  return typeof (c as HybridComms).syncBleFromExternalConnection === "function";
}

/** Flip to `false` to restore Wi‑Fi-only comms without code removal. */
export const USE_HYBRID_DUAL_LINK = true;
