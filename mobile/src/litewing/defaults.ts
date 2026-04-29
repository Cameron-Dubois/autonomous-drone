/**
 * LiteWing / ESP-Drone style defaults (Wi‑Fi + CRTP/UDP).
 *
 * Values are taken from public ESP-Drone and LiteWing community docs.
 * Confirm against your exact firmware and monitor logs before relying on them in flight.
 *
 * @see mobile/docs/litewing-pairing.md
 */

/** Soft AP name prefix, e.g. `LiteWing_aabbccddeeff`. */
export const LITEWING_SSID_PREFIX = "LiteWing_" as const;

/** Default Wi‑Fi password from vendor/community guides; may differ if firmware was customized. */
export const LITEWING_DEFAULT_WIFI_PASSWORD = "12345678";

/**
 * Drone (UDP server) address on the AP network. ESP-Drone documentation uses 192.168.43.42 as an example.
 * Set `EXPO_PUBLIC_LITEWING_DRONE_HOST` at build time to override.
 */
function defaultDroneHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_LITEWING_DRONE_HOST;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return "192.168.43.42";
}

export const LITEWING_DRONE_HOST = defaultDroneHost();

/**
 * UDP port the drone listens on (phone → drone). From ESP-Drone comms table; verify on your build.
 * Set `EXPO_PUBLIC_LITEWING_DRONE_PORT` to override.
 */
function defaultDronePort(): number {
  const fromEnv = process.env.EXPO_PUBLIC_LITEWING_DRONE_PORT;
  if (fromEnv != null && fromEnv !== "") {
    const n = parseInt(fromEnv, 10);
    if (!Number.isNaN(n) && n > 0 && n <= 65535) return n;
  }
  return 2390;
}

export const LITEWING_DRONE_UDP_PORT = defaultDronePort();

/**
 * Local / app side UDP port (drone → phone) per ESP-Drone comms table. Verify on your build.
 * Set `EXPO_PUBLIC_LITEWING_APP_PORT` to override.
 */
function defaultAppPort(): number {
  const fromEnv = process.env.EXPO_PUBLIC_LITEWING_APP_PORT;
  if (fromEnv != null && fromEnv !== "") {
    const n = parseInt(fromEnv, 10);
    if (!Number.isNaN(n) && n > 0 && n <= 65535) return n;
  }
  return 2399;
}

export const LITEWING_APP_UDP_PORT = defaultAppPort();

export function isLiteWingSsid(ssid: string): boolean {
  return ssid.startsWith(LITEWING_SSID_PREFIX);
}
