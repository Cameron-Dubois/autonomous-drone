/**
 * Factory SoftAP credentials — must match `wifi_gps_softap` menuconfig defaults
 * unless overridden at build time via env.
 */
export const DRONE_WIFI_FACTORY_SSID =
  process.env.EXPO_PUBLIC_DRONE_WIFI_DEFAULT_SSID ?? "autonomous drone";

export const DRONE_WIFI_FACTORY_PASSWORD =
  process.env.EXPO_PUBLIC_DRONE_WIFI_DEFAULT_PASSWORD ?? "drone-id";
