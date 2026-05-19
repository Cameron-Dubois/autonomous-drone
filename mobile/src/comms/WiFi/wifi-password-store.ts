import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/** SSID trimming (Android may quote SSIDs). Used before hashing storage keys. */
export function normalizeWifiSsid(ssid: string): string {
  return ssid.replace(/^"|"$/g, "").trim();
}

/**
 * expo-secure-store keys must be non-empty and alphanumeric only (no raw SSIDs with spaces/colons).
 */
async function secureStoreKeyForSsid(ssid: string): Promise<string | null> {
  const t = normalizeWifiSsid(ssid);
  if (!t) return null;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t);
  return `wifi${digest}`;
}

export async function getStoredWifiPassword(ssid: string): Promise<string | null> {
  try {
    const key = await secureStoreKeyForSsid(ssid);
    if (!key) return null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStoredWifiPassword(ssid: string, password: string): Promise<void> {
  const key = await secureStoreKeyForSsid(ssid);
  if (!key) throw new Error("Cannot store Wi‑Fi password: SSID is empty.");
  await SecureStore.setItemAsync(key, password);
}

export async function clearStoredWifiPassword(ssid: string): Promise<void> {
  try {
    const key = await secureStoreKeyForSsid(ssid);
    if (!key) return;
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
