import {
  NullDroneProvider,
  SyntheticDroneProvider,
  TelemetryDroneProvider,
  type TelemetrySource,
  type TelemetryWithDroneGps,
} from "../../src/nav/drone-position-provider";
import type { DroneFix } from "../../src/nav/types";

describe("DronePositionProvider implementations", () => {
  it("NullDroneProvider emits null and unsubscribes cleanly", () => {
    const provider = new NullDroneProvider();
    const seen: (DroneFix | null)[] = [];
    const unsub = provider.subscribe((f) => seen.push(f));
    expect(seen).toEqual([null]);
    expect(() => unsub()).not.toThrow();
  });

  it("SyntheticDroneProvider broadcasts to multiple listeners and respects unsubscribe", () => {
    const provider = new SyntheticDroneProvider();
    const a: (DroneFix | null)[] = [];
    const b: (DroneFix | null)[] = [];
    const unsubA = provider.subscribe((f) => a.push(f));
    provider.subscribe((f) => b.push(f));

    const fix: DroneFix = { lat: 1, lon: 2, timestampMs: 1000 };
    provider.emit(fix);
    expect(a).toEqual([null, fix]);
    expect(b).toEqual([null, fix]);

    unsubA();
    provider.emit(null);
    expect(a).toEqual([null, fix]);
    expect(b).toEqual([null, fix, null]);
  });

  it("TelemetryDroneProvider converts telemetry to DroneFix using the injected clock", () => {
    type T = TelemetryWithDroneGps & { batteryPct?: number };
    const subscribers: ((t: T) => void)[] = [];
    const source: TelemetrySource<T> = {
      subscribeTelemetry(cb) {
        subscribers.push(cb);
        return () => {
          const idx = subscribers.indexOf(cb);
          if (idx >= 0) subscribers.splice(idx, 1);
        };
      },
    };

    const seen: (DroneFix | null)[] = [];
    const provider = new TelemetryDroneProvider<T>(source, () => 42);
    provider.subscribe((f) => seen.push(f));

    subscribers[0]?.({ droneLat: 37, droneLon: -122, droneGpsValid: true });
    subscribers[0]?.({ droneLat: null, droneLon: null });
    subscribers[0]?.({ droneLat: 1, droneLon: 1, droneGpsValid: false });

    expect(seen).toEqual([
      { lat: 37, lon: -122, timestampMs: 42, courseDeg: null },
      null,
      null,
    ]);
  });

  it("TelemetryDroneProvider passes droneHeadingDeg through as courseDeg", () => {
    type T = TelemetryWithDroneGps;
    const subscribers: ((t: T) => void)[] = [];
    const source: TelemetrySource<T> = {
      subscribeTelemetry(cb) {
        subscribers.push(cb);
        return () => {
          const idx = subscribers.indexOf(cb);
          if (idx >= 0) subscribers.splice(idx, 1);
        };
      },
    };

    const seen: (DroneFix | null)[] = [];
    const provider = new TelemetryDroneProvider<T>(source, () => 100);
    provider.subscribe((f) => seen.push(f));

    subscribers[0]?.({ droneLat: 10, droneLon: 20, droneGpsValid: true, droneHeadingDeg: 75 });
    subscribers[0]?.({ droneLat: 10, droneLon: 20, droneGpsValid: true, droneHeadingDeg: null });

    expect(seen[seen.length - 2]).toEqual({ lat: 10, lon: 20, timestampMs: 100, courseDeg: 75 });
    expect(seen[seen.length - 1]).toEqual({ lat: 10, lon: 20, timestampMs: 100, courseDeg: null });
  });
});
