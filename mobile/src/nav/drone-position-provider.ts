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
};

export type TelemetrySource<T extends TelemetryWithDroneGps> = {
  subscribeTelemetry(cb: (t: T) => void): () => void;
};

//wraps BLE or similar telemetry; keeps nav free of protocol imports
export class TelemetryDroneProvider<T extends TelemetryWithDroneGps> implements DronePositionProvider {
  constructor(
    private readonly source: TelemetrySource<T>,
    private readonly clock: () => number = () => Date.now()
  ) {}

  subscribe(cb: DroneFixCallback): DroneProviderUnsubscribe {
    return this.source.subscribeTelemetry((t) => {
      if (t.droneGpsValid === false) return cb(null);
      if (t.droneLat == null || t.droneLon == null) return cb(null);
      cb({
        lat: t.droneLat,
        lon: t.droneLon,
        timestampMs: this.clock(),
      });
    });
  }
}

//not wired yet, throws on subscribe so we notice unfinished work
export class WifiTelemetryDroneProviderStub implements DronePositionProvider {
  subscribe(_cb: DroneFixCallback): DroneProviderUnsubscribe {
    throw new Error(
      "WifiTelemetryDroneProvider is a stub: agree on host/port and JSON/TEL grammar with the drone team before enabling."
    );
  }
}
