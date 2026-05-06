/**
 * Parses BLE telemetry strings (UTF-8 after Base64 decode) into telemetry patches.
 * JSON and TEL line formats supported; see unit tests for examples.
 */

import type { Telemetry } from "./types";

/** Parse JSON or `TEL k=v ...` and merge-shaped fields. Always sets `link` from the second argument. */
export function parseBleTelemetryPayload(payload: string, link: Telemetry["link"]): Partial<Telemetry> {
  const result: Partial<Telemetry> = { link };

  const trimmed = payload.trim();
  if (!trimmed) return applyBatteryMinsHeuristic(result);

  if (trimmed.startsWith("{")) {
    try {
      parseJson(trimmed, result);
      return applyBatteryMinsHeuristic(result);
    } catch {
      return parseTel(trimmed, result);
    }
  }

  return parseTel(trimmed, result);
}

function parseJson(trimmed: string, result: Partial<Telemetry>): void {
  const data = JSON.parse(trimmed) as Record<string, unknown>;
  if (typeof data.batteryPct === "number") result.batteryPct = Math.round(data.batteryPct);
  if (typeof data.batteryMins === "number") result.batteryMins = Math.round(data.batteryMins);
  if (typeof data.speedKmh === "number") result.speedKmh = Math.round(data.speedKmh);
  if (typeof data.altM === "number") result.altM = Math.round(data.altM);
  if (typeof data.rssiBars === "number")
    result.rssiBars = Math.max(0, Math.min(4, Math.round(data.rssiBars))) as Telemetry["rssiBars"];
  if (typeof data.followMode === "boolean") result.followMode = data.followMode;

  applyJsonGeo(data, result);
}

function applyJsonGeo(data: Record<string, unknown>, result: Partial<Telemetry>): void {
  const lat = pickOptionalCoord(data, ["droneLat", "dlat"]);
  if (lat !== undefined) result.droneLat = lat;

  const lon = pickOptionalCoord(data, ["droneLon", "dlon"]);
  if (lon !== undefined) result.droneLon = lon;

  const valid = pickOptionalBool(data, ["droneGpsValid", "gpsValid", "gpsOk"]);
  if (valid !== undefined) result.droneGpsValid = valid;

  const fix = pickOptionalNonNegInt(data, ["droneGpsFixQuality", "gpsFix", "fix"]);
  if (fix !== undefined) result.droneGpsFixQuality = fix;

  const sats = pickOptionalNonNegInt(data, ["droneGpsSatellites", "gpsSats", "sats"]);
  if (sats !== undefined) result.droneGpsSatellites = sats;

  const hdop = pickOptionalHdop(data, ["droneGpsHdop", "hdop"]);
  if (hdop !== undefined) result.droneGpsHdop = hdop;

  const heading = pickOptionalHeading(data, ["droneHeadingDeg", "heading", "hdg", "course", "yaw"]);
  if (heading !== undefined) result.droneHeadingDeg = heading;
}

/** Normalize any finite heading-like number into [0, 360). Returns null for explicit null, undefined to omit. */
function pickOptionalHeading(data: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const v = data[k];
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return normalizeHeadingDeg(v);
  }
  return undefined;
}

function normalizeHeadingDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped;
}

/** number | null = explicit value; undefined = omit from patch */
function pickOptionalCoord(data: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const v = data[k];
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickOptionalHdop(data: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const v = data[k];
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickOptionalBool(data: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const v = data[k];
    if (typeof v === "boolean") return v;
    if (v === 0 || v === 1 || v === "0" || v === "1") return Boolean(Number(v));
  }
  return undefined;
}

function pickOptionalNonNegInt(data: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    const v = data[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const n = Math.round(v);
    if (n >= 0) return n;
  }
  return undefined;
}

function parseTel(trimmed: string, result: Partial<Telemetry>): Partial<Telemetry> {
  const parts = trimmed.replace(/^TEL\s+/i, "").split(/\s+/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const key = p.slice(0, eq).toLowerCase();
    const valRaw = p.slice(eq + 1);

    const vFloat = parseFloat(valRaw);

    switch (key) {
      case "alt":
        if (!isNaN(vFloat)) result.altM = Math.round(vFloat);
        break;
      case "batt":
        if (!isNaN(vFloat)) result.batteryPct = Math.round(vFloat);
        break;
      case "spd":
        if (!isNaN(vFloat)) result.speedKmh = Math.round(vFloat);
        break;
      case "rssi":
        if (!isNaN(vFloat)) {
          result.rssiBars = (vFloat >= -50 ? 4 : vFloat >= -60 ? 3 : vFloat >= -70 ? 2 : vFloat >= -80 ? 1 : 0) as Telemetry["rssiBars"];
        }
        break;
      case "follow":
        if (valRaw === "1" || /^true$/i.test(valRaw)) result.followMode = true;
        break;
      case "dlat":
        if (!isNaN(vFloat)) result.droneLat = vFloat;
        break;
      case "dlon":
        if (!isNaN(vFloat)) result.droneLon = vFloat;
        break;
      case "gps":
      case "gpsok":
      case "gps_ok":
      case "dv":
        result.droneGpsValid = valRaw === "1" || /^true$/i.test(valRaw) || /^yes$/i.test(valRaw);
        break;
      case "fix":
      case "fixq":
        if (!isNaN(vFloat)) result.droneGpsFixQuality = Math.max(0, Math.round(vFloat));
        break;
      case "sats":
        if (!isNaN(vFloat)) result.droneGpsSatellites = Math.max(0, Math.round(vFloat));
        break;
      case "hdop":
        if (!isNaN(vFloat)) result.droneGpsHdop = vFloat;
        break;
      case "heading":
      case "hdg":
      case "course":
      case "yaw":
        if (!isNaN(vFloat)) result.droneHeadingDeg = normalizeHeadingDeg(vFloat);
        break;
      default:
        break;
    }
  }

  return applyBatteryMinsHeuristic(result);
}

function applyBatteryMinsHeuristic(r: Partial<Telemetry>): Partial<Telemetry> {
  if (r.batteryMins == null && r.batteryPct != null) {
    r.batteryMins = Math.round((r.batteryPct / 100) * 30);
  }
  return r;
}
