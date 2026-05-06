import { parseBleTelemetryPayload } from "../src/protocol/telemetry-parse";
import type { Telemetry } from "../src/protocol/types";

const link: Telemetry["link"] = "SECURE_LINK";

describe("parseBleTelemetryPayload GPS", () => {
  it("parses canonical JSON GNSS fields", () => {
    const p = parseBleTelemetryPayload(
      JSON.stringify({
        droneLat: 37.234,
        droneLon: -121.982,
        droneGpsValid: true,
        droneGpsFixQuality: 2,
        droneGpsSatellites: 9,
        droneGpsHdop: 1.2,
        batteryPct: 80,
      }),
      link
    );
    expect(p.link).toBe("SECURE_LINK");
    expect(p.droneLat).toBe(37.234);
    expect(p.droneLon).toBe(-121.982);
    expect(p.droneGpsValid).toBe(true);
    expect(p.droneGpsFixQuality).toBe(2);
    expect(p.droneGpsSatellites).toBe(9);
    expect(p.droneGpsHdop).toBe(1.2);
    expect(p.batteryPct).toBe(80);
    expect(p.batteryMins).toBe(Math.round((80 / 100) * 30));
  });

  it("parses JSON aliases (dlat/dlon/gpsOk/fix/gpsSats/hdop)", () => {
    const p = parseBleTelemetryPayload(
      JSON.stringify({ dlat: 1.5, dlon: -2.5, gpsOk: 1, fix: 1, gpsSats: 4, hdop: 2.0 }),
      link
    );
    expect(p.droneLat).toBe(1.5);
    expect(p.droneLon).toBe(-2.5);
    expect(p.droneGpsValid).toBe(true);
    expect(p.droneGpsFixQuality).toBe(1);
    expect(p.droneGpsSatellites).toBe(4);
    expect(p.droneGpsHdop).toBe(2);
  });

  it("JSON null clears coords", () => {
    const p = parseBleTelemetryPayload(JSON.stringify({ droneLat: null, droneLon: null }), link);
    expect(p.droneLat).toBeNull();
    expect(p.droneLon).toBeNull();
  });

  it("parses TEL line with GNSS tokens", () => {
    const p = parseBleTelemetryPayload(
      "TEL batt=71 dlat=37.776 dlon=-122.419 gps=1 fix=2 sats=10 hdop=0.9",
      link
    );
    expect(p.batteryPct).toBe(71);
    expect(p.droneLat).toBeCloseTo(37.776);
    expect(p.droneLon).toBeCloseTo(-122.419);
    expect(p.droneGpsValid).toBe(true);
    expect(p.droneGpsFixQuality).toBe(2);
    expect(p.droneGpsSatellites).toBe(10);
    expect(p.droneGpsHdop).toBeCloseTo(0.9);
  });

  it("TEL gps=0 clears valid expectation", () => {
    const p = parseBleTelemetryPayload("TEL dlat=0 dlon=-1 gps=0", link);
    expect(p.droneGpsValid).toBe(false);
  });

  it("backward compat alt/spd/batt/rssi/follow", () => {
    const p = parseBleTelemetryPayload("TEL alt=10 spd=42 batt=55 rssi=-62 follow=1", link);
    expect(p.altM).toBe(10);
    expect(p.speedKmh).toBe(42);
    expect(p.batteryPct).toBe(55);
    expect(p.rssiBars).toBe(2);
    expect(p.followMode).toBe(true);
  });

  it("falls back from invalid JSON-shaped string to TEL-style tokens", () => {
    const p = parseBleTelemetryPayload("{ not json batt=61 dlon=-100 gps=1", link);
    expect(p.batteryPct).toBe(61);
    expect(p.droneLon).toBe(-100);
    expect(p.droneGpsValid).toBe(true);
  });

  it("parses canonical JSON heading", () => {
    const p = parseBleTelemetryPayload(JSON.stringify({ droneHeadingDeg: 123.4 }), link);
    expect(p.droneHeadingDeg).toBeCloseTo(123.4);
  });

  it("parses heading aliases (heading/hdg/course/yaw) and wraps into [0,360)", () => {
    expect(parseBleTelemetryPayload(JSON.stringify({ heading: 45 }), link).droneHeadingDeg).toBe(45);
    expect(parseBleTelemetryPayload(JSON.stringify({ hdg: 359.9 }), link).droneHeadingDeg).toBeCloseTo(359.9);
    expect(parseBleTelemetryPayload(JSON.stringify({ course: 360 }), link).droneHeadingDeg).toBe(0);
    expect(parseBleTelemetryPayload(JSON.stringify({ yaw: -10 }), link).droneHeadingDeg).toBe(350);
    expect(parseBleTelemetryPayload(JSON.stringify({ heading: 720 }), link).droneHeadingDeg).toBe(0);
  });

  it("JSON null clears heading", () => {
    const p = parseBleTelemetryPayload(JSON.stringify({ droneHeadingDeg: null }), link);
    expect(p.droneHeadingDeg).toBeNull();
  });

  it("parses TEL heading tokens", () => {
    expect(parseBleTelemetryPayload("TEL heading=90", link).droneHeadingDeg).toBe(90);
    expect(parseBleTelemetryPayload("TEL hdg=185.5", link).droneHeadingDeg).toBeCloseTo(185.5);
    expect(parseBleTelemetryPayload("TEL course=-5", link).droneHeadingDeg).toBe(355);
    expect(parseBleTelemetryPayload("TEL yaw=400", link).droneHeadingDeg).toBe(40);
  });
});
