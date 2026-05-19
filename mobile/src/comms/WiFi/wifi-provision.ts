import * as Crypto from "expo-crypto";
import { DRONE_AP_HOST, probeDroneReachable } from "../../stream/droneStream";

const DRONE_HTTPS_BASE = `https://${DRONE_AP_HOST}`;
const FETCH_TIMEOUT_MS = 12_000;

export type WifiProvisionStatus = {
  provisioned: boolean;
  ssid: string;
};

const PROVISION_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Thrown when the phone cannot complete HTTPS to the drone SoftAP gateway. */
export class DroneHttpsUnreachableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DroneHttpsUnreachableError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Generate a WPA2-safe random password using secure random bytes. */
export async function generateDroneWifiPassword(length = 16): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(length);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += PROVISION_ALPHABET[bytes[i]! % PROVISION_ALPHABET.length];
  }
  return out;
}

export async function ensureDroneHttpsReachable(): Promise<void> {
  const ok = await probeDroneReachable(5000);
  if (!ok) {
    throw new DroneHttpsUnreachableError(
      `Cannot reach https://${DRONE_AP_HOST}/. Join the drone hotspot in Settings, turn off mobile data if needed, then try again.`
    );
  }
}

async function droneFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${DRONE_HTTPS_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      throw new DroneHttpsUnreachableError(
        `Timed out talking to https://${DRONE_AP_HOST}${path}. Stay on the drone Wi‑Fi and retry.`,
        e
      );
    }
    throw new DroneHttpsUnreachableError(
      `Network request failed for https://${DRONE_AP_HOST}${path}. Join the drone hotspot (not home Wi‑Fi), then retry.`,
      e
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await res.json()) as T & { error?: string };
  } catch {
    throw new Error(`WiFi API ${res.status}: invalid response`);
  }
  if (!res.ok) {
    const err = body?.error;
    throw new Error(err ? `WiFi API ${res.status}: ${err}` : `WiFi API ${res.status}`);
  }
  return body as T;
}

export async function fetchWifiStatus(): Promise<WifiProvisionStatus> {
  const res = await droneFetch("/wifi/status", { method: "GET" });
  return readJson<WifiProvisionStatus>(res);
}

export async function provisionWifi(
  newPassword: string,
  factoryPassword: string
): Promise<{ ok: boolean; ssid: string }> {
  const res = await droneFetch("/wifi/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword, factoryPassword }),
  });
  return readJson<{ ok: boolean; ssid: string }>(res);
}

/** Replace WPA2 passphrase while already provisioned in NVS. */
export async function rotateWifiPassword(
  newPassword: string,
  currentPassword: string
): Promise<{ ok: boolean; ssid: string }> {
  const res = await droneFetch("/wifi/rotate-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword, currentPassword }),
  });
  return readJson<{ ok: boolean; ssid: string }>(res);
}

export async function factoryResetWifi(
  currentPassword: string
): Promise<{ ok: boolean }> {
  const res = await droneFetch("/wifi/factory-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword }),
  });
  return readJson<{ ok: boolean }>(res);
}

/**
 * First-time provision or rotate when already provisioned.
 * If `/wifi/status` is unreachable, tries rotate when `currentPassword` is known.
 */
export async function provisionOrRotateWifi(
  newPassword: string,
  currentPassword: string | null,
  factoryPassword: string
): Promise<{ ok: boolean; ssid: string }> {
  await ensureDroneHttpsReachable();

  let status: WifiProvisionStatus | null = null;
  try {
    status = await fetchWifiStatus();
  } catch {
    status = null;
  }

  if (status?.provisioned) {
    if (!currentPassword) {
      throw new Error("current_password_required");
    }
    return rotateWifiPassword(newPassword, currentPassword);
  }

  if (status && !status.provisioned) {
    const factory = currentPassword ?? factoryPassword;
    return provisionWifi(newPassword, factory);
  }

  /* Status unknown: prefer rotate when we have a saved/current passphrase. */
  if (currentPassword) {
    try {
      return await rotateWifiPassword(newPassword, currentPassword);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!/not_provisioned|WiFi API 409/.test(msg)) {
        throw e;
      }
    }
    return provisionWifi(newPassword, factoryPassword);
  }

  return provisionWifi(newPassword, factoryPassword);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatWifiProvisionError(e: unknown, factoryPassword: string): string {
  if (e instanceof DroneHttpsUnreachableError) {
    return e.message;
  }
  const raw = e instanceof Error ? e.message : "Wi‑Fi update failed";
  if (raw === "current_password_required") {
    return "Enter your current drone hotspot password (the one that works in Settings → Wi‑Fi).";
  }
  if (/current_password|WiFi API 403/.test(raw)) {
    return `Wrong current hotspot password. Use the passphrase that works in Settings → Wi‑Fi, not the factory default unless the drone was reset.`;
  }
  if (/already_provisioned|WiFi API 409/.test(raw) && /provision/.test(raw)) {
    return `Drone is already provisioned. Enter the current hotspot password and use New random again, or factory reset first.`;
  }
  if (/404|rotate-password/.test(raw)) {
    return `${raw}\n\nFlash latest wifi_gps_softap firmware (includes /wifi/rotate-password).`;
  }
  if (/Network request failed|fetch|Failed to fetch|invalid response/i.test(raw)) {
    return `${raw}\n\nJoin drone Wi‑Fi at https://${DRONE_AP_HOST} (disable mobile data). Rebuild the app if TLS to the drone never worked.`;
  }
  if (/factory_password|WiFi API 403/.test(raw)) {
    return `${raw}\n\nFactory passphrase in app is "${factoryPassword}" — must match firmware menuconfig.`;
  }
  return raw;
}
