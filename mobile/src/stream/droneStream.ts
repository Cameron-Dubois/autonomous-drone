/** SoftAP default gateway; ESP-IDF uses 192.168.4.1 for the AP interface. */
export const DRONE_AP_HOST = "192.168.4.1";

/** HTTP path served by drone_wifi softAP example; firmware may serve MJPEG or chunked stream here. */
export const DRONE_STREAM_PATH = "/stream";

const DRONE_HTTP_SCHEME = "http";
const DRONE_HTTP_PORT = 80;

export function buildDroneRootUrl(): string {
  return `${DRONE_HTTP_SCHEME}://${DRONE_AP_HOST}/`;
}

export function buildDroneStreamUrl(): string {
  return `${DRONE_HTTP_SCHEME}://${DRONE_AP_HOST}${DRONE_STREAM_PATH}`;
}

/**
 * Returns true if the drone HTTP server answers (e.g. GET / returns 200).
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
