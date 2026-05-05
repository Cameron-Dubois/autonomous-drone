//foreground phone GPS via expo-location, streamed as PhoneFix

import * as Location from "expo-location";
import type { PhoneFix } from "./types";

export type PhoneFixCallback = (fix: PhoneFix | null) => void;

export type PhoneFixSourceOptions = {
  //min move in m before OS may fire
  distanceIntervalM?: number;
  //min time in ms between updates
  timeIntervalMs?: number;
  accuracy?: Location.LocationAccuracy;
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
      watcher = await Location.watchPositionAsync(
        {
          accuracy: opts.accuracy ?? Location.Accuracy.Balanced,
          distanceInterval: opts.distanceIntervalM ?? 2,
          timeInterval: opts.timeIntervalMs ?? 1000,
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
