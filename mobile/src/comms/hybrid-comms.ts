/**
 * Wraps Wi‑Fi `DroneComms` (WSS telemetry + link state) and merges BLE notifications
 * without letting BLE overwrite `link` (WebSocket remains source of truth for link).
 * Commands go over BLE when a GATT connection exists, else fall back to Wi‑Fi WS.
 */
import type { DroneComms, TelemetryCallback } from "./comms";
import { buildCommandBytes, createDefaultTelemetry, type Command, type Telemetry } from "../protocol/types";
import { parseBleTelemetryPayload } from "../protocol/telemetry-parse";
import { ensureBleConnected, getBleClient } from "./BLE";

const BLE_ATTACH_POLL_MS = 900;
/** Should stay well below flight_control LINK_TIMEOUT_MS (THROTTLE_RAMP_MS + 4000). */
const BLE_HEARTBEAT_MS = 800;

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
  /** Call when the app tears down the BLE GATT session (Connect → Disconnect). */
  notifyBleDisconnected(): void;
  /**
   * BLE-only uplink — no Wi‑Fi fallback (quiet return if no GATT connection).
   * Used by Follow-mock so UART logs mirror the UI without bridging over WS.
   */
  sendBytesBleOnly(bytes: Uint8Array): Promise<void>;
};

export function createHybridComms(inner: DroneComms): HybridComms {
  const hybridListeners = new Set<TelemetryCallback>();
  let lastTelemetry: Telemetry = createDefaultTelemetry();

  let innerUnsub: (() => void) | null = null;
  let bleUnsub: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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

  const startBleHeartbeat = () => {
    if (heartbeatTimer != null) return;
    heartbeatTimer = setInterval(() => {
      void (async () => {
        try {
          const client = getBleClient();
          if (!client.getConnectedDeviceId()) return;
          await client.sendCommand(buildCommandBytes({ type: "HEARTBEAT" }));
        } catch {
          /* BLE teardown or Expo */
        }
      })();
    }, BLE_HEARTBEAT_MS);
  };

  const stopBleHeartbeat = () => {
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
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
      if (!client.getConnectedDeviceId()) {
        await ensureBleConnected();
      }
      if (client.getConnectedDeviceId()) {
        await client.sendCommand(bytes);
        /* flight_control disarms if no BLE traffic for LINK_TIMEOUT_MS — Control tab often
         * has zero telemetry subscribers, so poll+heartbeat must not depend on Home alone. */
        startPoll();
        startBleHeartbeat();
        tryAttachBleTelemetry();
        return;
      }
    } catch {
      /* fall through to Wi‑Fi */
    }
    await inner.sendBytes(bytes);
  };

  const sendBytesBleOnly = async (bytes: Uint8Array): Promise<void> => {
    try {
      const client = getBleClient();
      if (!client.getConnectedDeviceId()) {
        await ensureBleConnected();
      }
      if (!client.getConnectedDeviceId()) return;
      await client.sendCommand(bytes);
      startPoll();
      startBleHeartbeat();
      tryAttachBleTelemetry();
    } catch {
      /* GATT teardown / Expo stub */
    }
  };

  return {
    connect: (deviceId?: string) => inner.connect(deviceId),
    disconnect: () => inner.disconnect(),
    send: async (cmd: Command) => {
      await sendBytes(buildCommandBytes(cmd));
    },
    sendBytes,
    sendBytesBleOnly,

    subscribeTelemetry(cb: TelemetryCallback): () => void {
      hybridListeners.add(cb);
      if (hybridListeners.size === 1) {
        startInnerBridge();
        tryAttachBleTelemetry();
        startPoll();
        startBleHeartbeat();
      } else {
        cb(lastTelemetry);
      }
      return () => {
        hybridListeners.delete(cb);
        if (hybridListeners.size === 0) {
          stopInnerBridge();
          /* Keep BLE poll+heartbeat while GATT is up so ARM isn't killed by link timeout
           * when the user leaves Home for Connect/Control only. */
          try {
            if (!getBleClient().getConnectedDeviceId()) {
              stopPoll();
              stopBleHeartbeat();
              detachBle();
            }
          } catch {
            stopPoll();
            stopBleHeartbeat();
            detachBle();
          }
        }
      };
    },

    syncBleFromExternalConnection() {
      detachBle();
      startPoll();
      startBleHeartbeat();
      tryAttachBleTelemetry();
    },

    notifyBleDisconnected() {
      stopPoll();
      stopBleHeartbeat();
      detachBle();
    },
  };
}

export function isHybridComms(c: DroneComms): c is HybridComms {
  return (
    typeof (c as HybridComms).syncBleFromExternalConnection === "function" &&
    typeof (c as HybridComms).notifyBleDisconnected === "function" &&
    typeof (c as HybridComms).sendBytesBleOnly === "function"
  );
}

/** Flip to `false` to restore Wi‑Fi-only comms without code removal. */
export const USE_HYBRID_DUAL_LINK = true;
