import * as Crypto from "expo-crypto";

import { DRONE_AP_HOST } from "../../stream/droneStream";

const DRONE_HTTPS_BASE = `https://${DRONE_AP_HOST}`;

export type WifiProvisionStatus = {
  provisioned: boolean;
  ssid: string;
};

const PROVISION_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Generate WPA2 passphrase using secure random bytes (RN has no Web Crypto global). */
export async function generateDroneWifiPassword(length = 16): Promise<string> {
  const raw = await Crypto.getRandomBytesAsync(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PROVISION_ALPHABET[raw[i]! % PROVISION_ALPHABET.length];
  }
  return out;
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const err = (body as { error?: string }).error;
    throw new Error(err ? `WiFi API ${res.status}: ${err}` : `WiFi API ${res.status}`);
  }
  return body;
}

export async function fetchWifiStatus(): Promise<WifiProvisionStatus> {
  const res = await fetch(`${DRONE_HTTPS_BASE}/wifi/status`, { method: "GET" });
  return readJson<WifiProvisionStatus>(res);
}

export async function provisionWifi(
  newPassword: string,
  factoryPassword: string
): Promise<{ ok: boolean; ssid: string }> {
  const res = await fetch(`${DRONE_HTTPS_BASE}/wifi/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword, factoryPassword }),
  });
  return readJson<{ ok: boolean; ssid: string }>(res);
}

/** Replace WPA2 passphrase (drone already provisioned). Caller must reconnect Wi‑Fi to the AP. */
export async function rotateWifiPassword(
  newPassword: string,
  currentPassword: string
): Promise<{ ok: boolean; ssid: string }> {
  const res = await fetch(`${DRONE_HTTPS_BASE}/wifi/rotate-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword, currentPassword }),
  });
  return readJson<{ ok: boolean; ssid: string }>(res);
}

export async function factoryResetWifi(
  currentPassword: string
): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRONE_HTTPS_BASE}/wifi/factory-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword }),
  });
  return readJson<{ ok: boolean }>(res);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
