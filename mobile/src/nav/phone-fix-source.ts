//foreground phone GPS via expo-location, streamed as PhoneFix

import * as Location from "expo-location";
import type { PhoneFix } from "./types";

export type PhoneFixCallback = (fix: PhoneFix | null) => void;

export type PhoneFixSourceOptions = {
  /** Min move in m before OS may fire; 0 = time-based only (best for distance readouts). */
  distanceIntervalM?: number;
  /** Min time between updates (ms). */
  timeIntervalMs?: number;
  accuracy?: Location.LocationAccuracy;
  /** Request an immediate fix before starting the watcher (matches high-accuracy Home UX). Default true. */
  primeWithCurrentPosition?: boolean;
};

export type PhoneFixSource = {
  start(): Promise<void>;
  stop(): void;
  subscribe(cb: PhoneFixCallback): () => void;
  getLastFix(): PhoneFix | null;
};

export function createPhoneFixSource(opts: PhoneFixSourceOptions = {}): PhoneFixSource {
  const listeners = new Set<PhoneFixCallback>();
  let watcher: Location.LocationSubscription | null = null;
  let last: PhoneFix | null = null;

  const emit = (fix: PhoneFix | null) => {
    last = fix;
    for (const cb of listeners) cb(fix);
  };

  const handle = (loc: Location.LocationObject) => {
    emit({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      timestampMs: loc.timestamp,
      accuracyM: loc.coords.accuracy ?? null,
      altitudeM: loc.coords.altitude ?? null,
      courseDeg: loc.coords.heading ?? null,
      speedMps: loc.coords.speed ?? null,
    });
  };

  return {
    async start() {
      if (watcher) return;
      const existing = await Location.getForegroundPermissionsAsync();
      const perm = existing.granted ? existing : await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Location permission denied. Enable it in system settings to follow the phone.");
      }

      const prime = opts.primeWithCurrentPosition !== false;
      if (prime) {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: opts.accuracy ?? Location.Accuracy.BestForNavigation,
          });
          handle(loc);
        } catch {
          // Watcher will deliver once the chip fixes
        }
      }

      watcher = await Location.watchPositionAsync(
        {
          accuracy: opts.accuracy ?? Location.Accuracy.BestForNavigation,
          distanceInterval: opts.distanceIntervalM ?? 0,
          timeInterval: opts.timeIntervalMs ?? 2000,
          mayShowUserSettingsDialog: true,
        },
        handle
      );
    },
    stop() {
      watcher?.remove();
      watcher = null;
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(last);
      return () => {
        listeners.delete(cb);
      };
    },
    getLastFix() {
      return last;
    },
  };
}
