/**
 * WiFi-based DroneComms adapter. Opens a WebSocket to the drone over the
 * local AP and ships commands as binary frames; telemetry arrives as text
 * (JSON or "TEL k=v") and reuses the same parser as the BLE transport.
 *
 * Inbound  : text frames -> parseBleTelemetryPayload -> merge into Telemetry
 * Outbound : sendBytes(Uint8Array) -> single binary WebSocket frame
 *
 * NOTE: command framing on the wire (raw bytes vs Base64-in-JSON vs hex) is
 * still TBD with firmware. Today we send raw binary; if the firmware demands
 * a different shape, swap `encodeOutgoingCommand` only.
 */

import type { DroneComms } from "./comms";
import { buildCommandBytes, createDefaultTelemetry, type Command, type Telemetry } from "../protocol/types";
import { parseBleTelemetryPayload } from "../protocol/telemetry-parse";
import { buildDroneWsUrl } from "../stream/droneStream";

const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8_000;

function mergeTelemetry(prev: Telemetry, patch: Partial<Telemetry>): Telemetry {
  return { ...prev, ...patch };
}

/** Encode an outgoing command packet for WS transmission. v1 = raw binary frame. */
function encodeOutgoingCommand(bytes: Uint8Array): Uint8Array {
  return bytes;
}

/** Split a possibly multi-line text payload into individual JSON / TEL lines. */
function splitTelemetryLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type WifiCommsOptions = {
  /** Override the auto-built `ws://192.168.4.1:81/ws` URL (e.g. for a sim). */
  url?: string;
};

export function createWifiComms(options: WifiCommsOptions = {}): DroneComms {
  const DEFAULT_TELEMETRY: Telemetry = createDefaultTelemetry();
  const listeners = new Set<(t: Telemetry) => void>();
  let lastTelemetry: Telemetry = { ...DEFAULT_TELEMETRY };

  let socket: WebSocket | null = null;
  let intentionallyClosed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = RECONNECT_INITIAL_MS;

  const emit = (t: Telemetry) => {
    lastTelemetry = t;
    for (const cb of listeners) cb(t);
  };

  const setLink = (link: Telemetry["link"]) => {
    if (lastTelemetry.link === link) return;
    emit(mergeTelemetry(lastTelemetry, { link }));
  };

  const handleIncomingText = (raw: string) => {
    for (const line of splitTelemetryLines(raw)) {
      const patch = parseBleTelemetryPayload(line, "SECURE_LINK");
      emit(mergeTelemetry(lastTelemetry, patch));
    }
  };

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (intentionallyClosed) return;
    clearReconnect();
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const closeExistingSocket = () => {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {}
    socket = null;
  };

  const openSocket = () => {
    closeExistingSocket();
    setLink("CONNECTING");

    const url = options.url ?? buildDroneWsUrl();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.log("WiFi comms: WebSocket construction failed:", e);
      setLink("DISCONNECTED");
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      reconnectDelayMs = RECONNECT_INITIAL_MS;
      setLink("SECURE_LINK");
    };

    ws.onmessage = (event: WebSocketMessageEvent) => {
      const data = event.data;
      if (typeof data === "string") {
        handleIncomingText(data);
      }
      // Binary inbound frames are not part of the telemetry contract today;
      // ignore until firmware defines a binary telemetry encoding.
    };

    ws.onerror = () => {
      // onclose follows; let it handle the state transition.
    };

    ws.onclose = () => {
      socket = null;
      setLink("DISCONNECTED");
      scheduleReconnect();
    };
  };

  const sendBytes = async (bytes: Uint8Array): Promise<void> => {
    if (!socket || socket.readyState !== 1 /* OPEN */) return;
    const encoded = encodeOutgoingCommand(bytes);
    // React Native's WebSocket accepts ArrayBuffer; ensure we pass a fresh one
    // sized exactly to the payload (avoids sending the underlying TypedArray's full buffer).
    const buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    socket.send(buf);
  };

  return {
    async connect(_deviceId?: string): Promise<void> {
      intentionallyClosed = false;
      reconnectDelayMs = RECONNECT_INITIAL_MS;
      openSocket();
    },

    async disconnect(): Promise<void> {
      intentionallyClosed = true;
      clearReconnect();
      closeExistingSocket();
      emit(mergeTelemetry(lastTelemetry, { link: "DISCONNECTED" }));
    },

    async send(cmd: Command): Promise<void> {
      await sendBytes(buildCommandBytes(cmd));
    },

    sendBytes,

    subscribeTelemetry(cb: (t: Telemetry) => void): () => void {
      listeners.add(cb);
      cb(lastTelemetry);
      return () => listeners.delete(cb);
    },
  };
}
