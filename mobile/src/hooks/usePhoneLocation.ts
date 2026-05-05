import * as Location from "expo-location";
import { PermissionStatus } from "expo-location";
import { useCallback, useEffect, useState } from "react";

export type PhoneLocationPermission = "unknown" | "undetermined" | "granted" | "denied";

export type PhoneLocationSnapshot = {
  permission: PhoneLocationPermission;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  timestampMs: number | null;
  error: string | null;
};

const initial: PhoneLocationSnapshot = {
  permission: "unknown",
  lat: null,
  lon: null,
  accuracyM: null,
  timestampMs: null,
  error: null,
};

export type UsePhoneLocationOptions = {
  /** When false, watchers are torn down */
  enabled?: boolean;
  timeIntervalMs?: number;
  distanceIntervalM?: number;
};

/**
 * Foreground GNSS fixes for showing the handset next to drone telemetry.
 * Requests “when in use” permission once on mount when still undetermined.
 */
export function usePhoneLocation(opts: UsePhoneLocationOptions = {}): PhoneLocationSnapshot & {
  retryPermission: () => void;
} {
  const enabled = opts.enabled !== false;
  const timeIntervalMs = opts.timeIntervalMs ?? 3000;
  const distanceIntervalM = opts.distanceIntervalM ?? 5;

  const [snap, setSnap] = useState<PhoneLocationSnapshot>(initial);
  const [retryKey, setRetryKey] = useState(0);

  const retryPermission = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) {
      setSnap({ ...initial, permission: "unknown", error: null });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;

    void (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status === PermissionStatus.UNDETERMINED) {
          ({ status } = await Location.requestForegroundPermissionsAsync());
        }

        if (cancelled) return;

        if (status !== PermissionStatus.GRANTED) {
          setSnap({
            ...initial,
            permission: status === PermissionStatus.DENIED ? "denied" : "undetermined",
            error: "Location permission not granted",
          });
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        if (!servicesEnabled) {
          setSnap({
            ...initial,
            permission: "granted",
            error: "Device location services are off",
          });
          return;
        }

        setSnap((s) => ({
          ...s,
          permission: "granted",
          error: null,
        }));

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: timeIntervalMs,
            distanceInterval: distanceIntervalM,
          },
          (loc) => {
            if (cancelled) return;
            setSnap({
              permission: "granted",
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              accuracyM: loc.coords.accuracy ?? null,
              timestampMs: loc.timestamp,
              error: null,
            });
          }
        );
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Location error";
          setSnap((s) => ({ ...s, error: msg }));
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, retryKey, timeIntervalMs, distanceIntervalM]);

  return { ...snap, retryPermission };
}
