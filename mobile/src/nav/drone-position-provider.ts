//push DroneFix streams into the navigator; not commands

import type { DroneFix } from "./types";

export type DroneFixCallback = (fix: DroneFix | null) => void;
export type DroneProviderUnsubscribe = () => void;

export interface DronePositionProvider {
  subscribe(cb: DroneFixCallback): DroneProviderUnsubscribe;
}

//no telemetry yet, always unknown position
export class NullDroneProvider implements DronePositionProvider {
  subscribe(cb: DroneFixCallback): DroneProviderUnsubscribe {
    cb(null);
    return () => {};
  }
}

//tests or UI demo, call emit to fake updates
export class SyntheticDroneProvider implements DronePositionProvider {
  private readonly listeners = new Set<DroneFixCallback>();
  private last: DroneFix | null;

  constructor(initial: DroneFix | null = null) {
    this.last = initial;
  }

  subscribe(cb: DroneFixCallback): DroneProviderUnsubscribe {
    this.listeners.add(cb);
    cb(this.last);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(fix: DroneFix | null): void {
    this.last = fix;
    for (const cb of this.listeners) cb(fix);
  }
}

//minimum fields any telemetry object must have for us to build a DroneFix
export type TelemetryWithDroneGps = {
  droneLat: number | null;
  droneLon: number | null;
  droneGpsValid?: boolean;
  droneHeadingDeg?: number | null;
};

export type TelemetrySource<T extends TelemetryWithDroneGps> = {
  subscribeTelemetry(cb: (t: T) => void): () => void;
};

//wraps the WiFi (or any) telemetry source; keeps nav free of protocol imports
const DEFAULT_HOLD_INVALID_GPS_MS = 20_000;

export class TelemetryDroneProvider<T extends TelemetryWithDroneGps> implements DronePositionProvider {
  private lastGoodFix: DroneFix | null = null;
  private lastGoodWallMs = 0;

  constructor(
    private readonly source: TelemetrySource<T>,
    private readonly clock: () => number = () => Date.now(),
    /**
     * While drone telemetry reports invalid/missing GPS, keep publishing the last good
     * lat/lon for this long so distance readouts do not flicker. Yaw uses latest heading
     * whenever a full valid frame arrives.
     */
    private readonly holdInvalidGpsMs: number = DEFAULT_HOLD_INVALID_GPS_MS
  ) {}

  subscribe(cb: DroneFixCallback): DroneProviderUnsubscribe {
    return this.source.subscribeTelemetry((t) => {
      const now = this.clock();
      const gpsLooksValid =
        t.droneGpsValid !== false &&
        t.droneLat != null &&
        t.droneLon != null &&
        Number.isFinite(t.droneLat) &&
        Number.isFinite(t.droneLon);

      if (gpsLooksValid) {
        const lat = t.droneLat as number;
        const lon = t.droneLon as number;
        const headingDeg =
          typeof t.droneHeadingDeg === "number" && Number.isFinite(t.droneHeadingDeg)
            ? t.droneHeadingDeg
            : null;
        const fix: DroneFix = {
          lat,
          lon,
          timestampMs: now,
          headingDeg,
          courseDeg: null,
        };
        this.lastGoodFix = fix;
        this.lastGoodWallMs = now;
        cb(fix);
        return;
      }

      if (
        this.holdInvalidGpsMs > 0 &&
        this.lastGoodFix != null &&
        now - this.lastGoodWallMs <= this.holdInvalidGpsMs
      ) {
        cb({
          ...this.lastGoodFix,
          timestampMs: now,
        });
        return;
      }

      cb(null);
    });
  }
}
