import {
  enuFromAnchor,
  haversineDistanceM,
  initialBearingDeg,
  isValidLatLon,
} from "../../src/nav/geo";

describe("geo helpers", () => {
  it("rejects out-of-range and non-finite lat/lon", () => {
    expect(isValidLatLon({ lat: 0, lon: 0 })).toBe(true);
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: -181 })).toBe(false);
    expect(isValidLatLon({ lat: Number.NaN, lon: 0 })).toBe(false);
    expect(isValidLatLon(null)).toBe(false);
  });

  it("haversine distance: SFO -> JFK is roughly 4150 km", () => {
    const sfo = { lat: 37.6213, lon: -122.379 };
    const jfk = { lat: 40.6413, lon: -73.7781 };
    const meters = haversineDistanceM(sfo, jfk);
    expect(meters / 1000).toBeGreaterThan(4090);
    expect(meters / 1000).toBeLessThan(4180);
  });

  it("haversine distance is zero between identical points", () => {
    expect(haversineDistanceM({ lat: 12.34, lon: 56.78 }, { lat: 12.34, lon: 56.78 })).toBeCloseTo(0, 6);
  });

  it("initial bearing for due-north and due-east targets", () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 3);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 3);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 3);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 3);
  });

  it("ENU offset reverses sign when point/anchor swap", () => {
    const anchor = { lat: 37.0, lon: -122.0 };
    const point = { lat: 37.001, lon: -121.999 };
    const a = enuFromAnchor(anchor, point);
    const b = enuFromAnchor(point, anchor);
    expect(a.east).toBeCloseTo(-b.east, 3);
    expect(a.north).toBeCloseTo(-b.north, 3);
    expect(a.east).toBeGreaterThan(0);
    expect(a.north).toBeGreaterThan(0);
  });
});
