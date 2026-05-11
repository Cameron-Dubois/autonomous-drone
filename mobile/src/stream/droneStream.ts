/** SoftAP default gateway; ESP-IDF uses 192.168.4.1 for the AP interface. */
export const DRONE_AP_HOST = "192.168.4.1";

/** HTTP path served by drone_wifi softAP example; firmware may serve MJPEG or chunked stream here. */
export const DRONE_STREAM_PATH = "/stream";

/** One-shot JSON snapshot from wifi_gps_softap (same fields as WebSocket telemetry). */
export const DRONE_GPS_PATH = "/gps";

/** Secure WebSocket path on wifi_gps_softap (TLS on port 443). */
export const DRONE_WS_PATH = "/ws";

const DRONE_HTTPS_SCHEME = "https";
const DRONE_WSS_SCHEME = "wss";

export function buildDroneRootUrl(): string {
  return `${DRONE_HTTPS_SCHEME}://${DRONE_AP_HOST}/`;
}

export function buildDroneStreamUrl(): string {
  return `${DRONE_HTTPS_SCHEME}://${DRONE_AP_HOST}${DRONE_STREAM_PATH}`;
}

export function buildDroneGpsUrl(): string {
  return `${DRONE_HTTPS_SCHEME}://${DRONE_AP_HOST}${DRONE_GPS_PATH}`;
}

/** wss:// host path only; port 443 is implicit (wifi_gps_softap). */
export function buildDroneWsUrl(): string {
  return `${DRONE_WSS_SCHEME}://${DRONE_AP_HOST}${DRONE_WS_PATH}`;
}

/**
 * Returns true if the drone HTTPS server answers (e.g. GET / returns 200).
 * Use after the phone is associated with the drone access point.
 */
export async function probeDroneReachable(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildDroneRootUrl(), {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
