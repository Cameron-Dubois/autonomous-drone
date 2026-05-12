import { createFollowToPhoneNavigator } from "../../src/nav/navigator";
import type { DroneFix, NavigationConfig, PhoneFix } from "../../src/nav/types";

const NOW = 1_700_000_000_000;

const phoneAt = (lat: number, lon: number, accuracyM: number | null = 5, ageMs = 0): PhoneFix => ({
  lat,
  lon,
  timestampMs: NOW - ageMs,
  accuracyM,
});

const droneAt = (
  lat: number,
  lon: number,
  ageMs = 0,
  headingDeg: number | null = null
): DroneFix => ({
  lat,
  lon,
  timestampMs: NOW - ageMs,
  headingDeg,
});

const CONFIG: NavigationConfig = {
  arrivalRadiusM: 5,
  arrivalHysteresisM: 2,
  maxPhoneAccuracyM: 25,
  maxFixAgeMs: 8_000,
};

describe("FollowToPhoneNavigator", () => {
  it("AWAITING_PHONE_FIX when phone is null", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({ phoneFix: null, droneFix: droneAt(0, 0), nowMs: NOW });
    expect(snap.intent).toBe("AWAITING_PHONE_FIX");
    expect(snap.distancePhoneToDrone_m).toBeNull();
    expect(snap.bearingDroneToPhone_deg).toBeNull();
  });

  it("WEAK_PHONE_GPS when accuracy exceeds threshold", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(37, -122, 200),
      droneFix: droneAt(37.0001, -122.0001),
      nowMs: NOW,
    });
    expect(snap.intent).toBe("WEAK_PHONE_GPS");
  });

  it("AWAITING_DRONE_FIX when phone present but drone null", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({ phoneFix: phoneAt(37, -122), droneFix: null, nowMs: NOW });
    expect(snap.intent).toBe("AWAITING_DRONE_FIX");
    expect(snap.phoneFix).not.toBeNull();
  });

  it("ARRIVED_OR_WITHIN_RADIUS when drone is inside arrival circle", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: droneAt(37, -122),
      nowMs: NOW,
    });
    expect(snap.intent).toBe("ARRIVED_OR_WITHIN_RADIUS");
    expect(snap.withinArrival).toBe(true);
    expect(snap.distancePhoneToDrone_m).toBeCloseTo(0, 3);
  });

  it("PROCEED_TOWARD_PHONE when drone is far from phone", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: droneAt(37.001, -122.001),
      nowMs: NOW,
    });
    expect(snap.intent).toBe("PROCEED_TOWARD_PHONE");
    expect(snap.distancePhoneToDrone_m).not.toBeNull();
    expect(snap.bearingDroneToPhone_deg).not.toBeNull();
  });

  it("hysteresis keeps ARRIVED while sliding past arrivalRadius by less than the margin", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    nav.evaluate({ phoneFix: phoneAt(37, -122), droneFix: droneAt(37, -122), nowMs: NOW });

    //about 6m north, past 5m ring but inside hysteresis band
    const insideHysteresis = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: droneAt(37 + 6 / 111_320, -122),
      nowMs: NOW + 100,
    });
    expect(insideHysteresis.intent).toBe("ARRIVED_OR_WITHIN_RADIUS");

    //about 10m north, outside radius and hysteresis
    const beyondHysteresis = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: droneAt(37 + 10 / 111_320, -122),
      nowMs: NOW + 200,
    });
    expect(beyondHysteresis.intent).toBe("PROCEED_TOWARD_PHONE");
  });

  it("treats stale fixes as missing", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const stalePhone = nav.evaluate({
      phoneFix: phoneAt(37, -122, 5, 30_000),
      droneFix: droneAt(37, -122),
      nowMs: NOW,
    });
    expect(stalePhone.intent).toBe("AWAITING_PHONE_FIX");

    const staleDrone = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: droneAt(37, -122, 30_000),
      nowMs: NOW,
    });
    expect(staleDrone.intent).toBe("AWAITING_DRONE_FIX");
  });

  it("rejects invalid lat/lon", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: { lat: 999, lon: 0, timestampMs: NOW },
      droneFix: droneAt(0, 0),
      nowMs: NOW,
    });
    expect(snap.intent).toBe("AWAITING_PHONE_FIX");
  });

  it("yawErrorDeg is null when drone heading missing", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(37.0001, -122),
      droneFix: droneAt(37, -122), //headingDeg null
      nowMs: NOW,
    });
    expect(snap.bearingDroneToPhone_deg).not.toBeNull();
    expect(snap.yawErrorDeg).toBeNull();
  });

  it("yawErrorDeg is null when bearing missing (no drone fix)", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(37, -122),
      droneFix: null,
      nowMs: NOW,
    });
    expect(snap.yawErrorDeg).toBeNull();
  });

  it("yawErrorDeg +90 when phone is east of drone facing north", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(0, 0.001), //slightly east
      droneFix: droneAt(0, 0, 0, 0), //facing north (heading = 0)
      nowMs: NOW,
    });
    expect(snap.bearingDroneToPhone_deg!).toBeCloseTo(90, 1);
    expect(snap.yawErrorDeg!).toBeCloseTo(90, 1);
  });

  it("yawErrorDeg -90 when phone is west of drone facing north", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    const snap = nav.evaluate({
      phoneFix: phoneAt(0, -0.001), //slightly west
      droneFix: droneAt(0, 0, 0, 0), //facing north
      nowMs: NOW,
    });
    expect(snap.bearingDroneToPhone_deg!).toBeCloseTo(270, 1);
    expect(snap.yawErrorDeg!).toBeCloseTo(-90, 1);
  });

  it("yawErrorDeg wraps to [-180, 180]: drone facing 350 deg, phone at bearing 10 deg -> +20", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    //phone slightly north (bearing ~0); drone heading 350 -> yawError = wrap180(0 - 350) = +10
    const snap = nav.evaluate({
      phoneFix: phoneAt(0.001, 0),
      droneFix: droneAt(0, 0, 0, 350),
      nowMs: NOW,
    });
    expect(snap.bearingDroneToPhone_deg!).toBeCloseTo(0, 1);
    expect(snap.yawErrorDeg!).toBeCloseTo(10, 1);
  });

  it("yawErrorDeg wraps to [-180, 180]: drone facing 10 deg, phone at bearing 350 -> -20", () => {
    const nav = createFollowToPhoneNavigator(CONFIG);
    //phone slightly NW so bearing wraps near 350
    const snap = nav.evaluate({
      phoneFix: phoneAt(0.001, -0.0001763), //rough NNW so bearing ~350
      droneFix: droneAt(0, 0, 0, 10),
      nowMs: NOW,
    });
    expect(snap.yawErrorDeg!).toBeLessThan(0);
    expect(snap.yawErrorDeg!).toBeGreaterThan(-30);
  });
});
