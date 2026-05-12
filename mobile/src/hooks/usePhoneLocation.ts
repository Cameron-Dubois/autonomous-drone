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
  accuracy?: Location.LocationAccuracy;
};

/**
 * Foreground GNSS fixes for showing the handset next to drone telemetry.
 * Requests “when in use” permission once on mount when still undetermined.
 *
 * Tuned for open-sky maximum accuracy: `BestForNavigation` keeps the GPS chip
 * on full-time (Android `PRIORITY_HIGH_ACCURACY` at the highest sample rate),
 * with no distance gate so updates flow continuously every ~2 s.
 */
export function usePhoneLocation(opts: UsePhoneLocationOptions = {}): PhoneLocationSnapshot & {
  retryPermission: () => void;
} {
  const enabled = opts.enabled !== false;
  const timeIntervalMs = opts.timeIntervalMs ?? 2000;
  const distanceIntervalM = opts.distanceIntervalM ?? 0;
  const accuracy = opts.accuracy ?? Location.Accuracy.BestForNavigation;

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

        // Cold-start primer: kicks the GPS chip into high-accuracy mode and seeds
        // the UI with the freshest available fix before the watcher's first tick.
        void Location.getCurrentPositionAsync({ accuracy })
          .then((loc) => {
            if (cancelled) return;
            setSnap({
              permission: "granted",
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              accuracyM: loc.coords.accuracy ?? null,
              timestampMs: loc.timestamp,
              error: null,
            });
          })
          .catch(() => {
            // No fix yet — the watcher will deliver one shortly.
          });

        subscription = await Location.watchPositionAsync(
          {
            accuracy,
            timeInterval: timeIntervalMs,
            distanceInterval: distanceIntervalM,
            mayShowUserSettingsDialog: true,
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
  }, [enabled, retryKey, timeIntervalMs, distanceIntervalM, accuracy]);

  return { ...snap, retryPermission };
}
