import * as SecureStore from "expo-secure-store";

const KEY_PREFIX = "wifi_pwd:";

function storageKey(ssid: string): string {
  return `${KEY_PREFIX}${ssid.trim()}`;
}

export async function getStoredWifiPassword(ssid: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(storageKey(ssid));
  } catch {
    return null;
  }
}

export async function setStoredWifiPassword(ssid: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(storageKey(ssid), password);
}

export async function clearStoredWifiPassword(ssid: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storageKey(ssid));
  } catch {
    // ignore
  }
}
