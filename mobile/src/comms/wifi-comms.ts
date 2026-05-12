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
import { buildDroneGpsUrl, buildDroneWsUrl } from "../stream/droneStream";

const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const GPS_HTTP_POLL_MS = 2_000;
const LOG = "[drone wifi]";

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG, ...args);
}
function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(LOG, ...args);
}

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
  /** Override the auto-built `wss://192.168.4.1:443/ws` URL (e.g. for a sim). */
  url?: string;
  /**
   * When true (default), periodically GET `https://192.168.4.1/gps` whenever the WebSocket
   * is not `SECURE_LINK` — same TLS trust as `fetch`, helps when WSS handshake fails.
   * Set false in unit tests.
   */
  enableHttpGpsFallback?: boolean;
};

export function createWifiComms(options: WifiCommsOptions = {}): DroneComms {
  const httpGpsFallback = options.enableHttpGpsFallback !== false;
  const DEFAULT_TELEMETRY: Telemetry = createDefaultTelemetry();
  const listeners = new Set<(t: Telemetry) => void>();
  let lastTelemetry: Telemetry = { ...DEFAULT_TELEMETRY };

  let socket: WebSocket | null = null;
  let intentionallyClosed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = RECONNECT_INITIAL_MS;
  let gpsPollTimer: ReturnType<typeof setInterval> | null = null;

  const emit = (t: Telemetry) => {
    lastTelemetry = t;
    for (const cb of listeners) cb(t);
  };

  const setLink = (link: Telemetry["link"]) => {
    if (lastTelemetry.link === link) return;
    emit(mergeTelemetry(lastTelemetry, { link }));
  };

  const handleIncomingText = (raw: string) => {
    const lines = splitTelemetryLines(raw);
    for (const line of lines) {
      log("ws msg (full):", line);
    }
    for (const line of lines) {
      const patch = parseBleTelemetryPayload(line, "SECURE_LINK");
      emit(mergeTelemetry(lastTelemetry, patch));
    }
  };

  /** Merge GPS/telemetry JSON without forcing `link: SECURE_LINK` (used for HTTP /gps fallback). */
  const mergeTelemetryTextWithoutLink = (raw: string) => {
    for (const line of splitTelemetryLines(raw)) {
      const patch = parseBleTelemetryPayload(line, "SECURE_LINK");
      const { link: _drop, ...rest } = patch;
      emit(mergeTelemetry(lastTelemetry, rest));
    }
  };

  const clearGpsPoll = () => {
    if (gpsPollTimer != null) {
      clearInterval(gpsPollTimer);
      gpsPollTimer = null;
      log("gps poll stopped");
    }
  };

  const startGpsPoll = () => {
    if (!httpGpsFallback) return;
    clearGpsPoll();
    const url = buildDroneGpsUrl();
    log("gps poll started ->", url, `every ${GPS_HTTP_POLL_MS}ms`);
    gpsPollTimer = setInterval(() => {
      if (intentionallyClosed || lastTelemetry.link === "SECURE_LINK") return;
      void (async () => {
        try {
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) {
            warn(`gps poll: HTTP ${res.status}`);
            return;
          }
          const text = await res.text();
          log("gps poll ok (full):", text);
          mergeTelemetryTextWithoutLink(text);
        } catch (e) {
          warn("gps poll failed:", e instanceof Error ? e.message : String(e));
        }
      })();
    }, GPS_HTTP_POLL_MS);
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
    log("ws connect ->", url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      warn("ws construction failed:", e instanceof Error ? e.message : String(e));
      setLink("DISCONNECTED");
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      reconnectDelayMs = RECONNECT_INITIAL_MS;
      log("ws open ->", url);
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

    ws.onerror = (event) => {
      const msg =
        (event as { message?: string }).message ??
        ((event as { error?: { message?: string } }).error?.message ?? "unknown");
      warn("ws error:", msg);
    };

    ws.onclose = (ev) => {
      const code = (ev as { code?: number }).code;
      const reason = typeof (ev as { reason?: string }).reason === "string" ? (ev as { reason: string }).reason : "";
      warn(`ws close code=${code ?? "?"} reason="${reason}"`);
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
      log("connect() called");
      intentionallyClosed = false;
      reconnectDelayMs = RECONNECT_INITIAL_MS;
      startGpsPoll();
      openSocket();
    },

    async disconnect(): Promise<void> {
      log("disconnect() called");
      intentionallyClosed = true;
      clearGpsPoll();
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
