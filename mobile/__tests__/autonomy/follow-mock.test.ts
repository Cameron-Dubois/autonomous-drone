import {
  DEFAULT_FOLLOW_MOCK_CONFIG,
  evaluateFollowMock,
  type FollowMockConfig,
  type FollowState,
} from "../../src/autonomy/follow-mock";
import type { NavigationSnapshot } from "../../src/nav/types";

const CFG: FollowMockConfig = { ...DEFAULT_FOLLOW_MOCK_CONFIG };

function snap(
  overrides: Partial<NavigationSnapshot> & Pick<NavigationSnapshot, "intent">
): NavigationSnapshot {
  return {
    intent: overrides.intent,
    distancePhoneToDrone_m: overrides.distancePhoneToDrone_m ?? null,
    bearingDroneToPhone_deg: overrides.bearingDroneToPhone_deg ?? null,
    yawErrorDeg: overrides.yawErrorDeg ?? null,
    phoneFix: overrides.phoneFix ?? null,
    droneFix: overrides.droneFix ?? null,
    withinArrival: overrides.withinArrival ?? false,
    generatedAtMs: overrides.generatedAtMs ?? 0,
  };
}

const HEALTHY_FAR: NavigationSnapshot = snap({
  intent: "PROCEED_TOWARD_PHONE",
  distancePhoneToDrone_m: 10,
  bearingDroneToPhone_deg: 90,
  yawErrorDeg: 0,
});

const HEALTHY_FAR_RIGHT: NavigationSnapshot = snap({
  intent: "PROCEED_TOWARD_PHONE",
  distancePhoneToDrone_m: 10,
  bearingDroneToPhone_deg: 90,
  yawErrorDeg: 45,
});

const HEALTHY_FAR_LEFT: NavigationSnapshot = snap({
  intent: "PROCEED_TOWARD_PHONE",
  distancePhoneToDrone_m: 10,
  bearingDroneToPhone_deg: 270,
  yawErrorDeg: -45,
});

const HEALTHY_NEAR: NavigationSnapshot = snap({
  intent: "ARRIVED_OR_WITHIN_RADIUS",
  distancePhoneToDrone_m: 1.0,
  bearingDroneToPhone_deg: 0,
  yawErrorDeg: 0,
});

describe("evaluateFollowMock", () => {
  it("running=false returns IDLE and zero throttles regardless of state", () => {
    for (const state of ["IDLE", "ROTATE", "FORWARD", "HOLD"] as FollowState[]) {
      const out = evaluateFollowMock({ state, snapshot: HEALTHY_FAR_RIGHT, running: false }, CFG);
      expect(out.nextState).toBe("IDLE");
      expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
    }
  });

  it("AWAITING_PHONE_FIX -> IDLE + zero throttles", () => {
    const out = evaluateFollowMock(
      { state: "FORWARD", snapshot: snap({ intent: "AWAITING_PHONE_FIX" }), running: true },
      CFG
    );
    expect(out.nextState).toBe("IDLE");
    expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
    expect(out.reason).toMatch(/unhealthy/);
  });

  it("AWAITING_DRONE_FIX -> IDLE", () => {
    const out = evaluateFollowMock(
      { state: "ROTATE", snapshot: snap({ intent: "AWAITING_DRONE_FIX" }), running: true },
      CFG
    );
    expect(out.nextState).toBe("IDLE");
    expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
  });

  it("WEAK_PHONE_GPS -> IDLE", () => {
    const out = evaluateFollowMock(
      { state: "FORWARD", snapshot: snap({ intent: "WEAK_PHONE_GPS" }), running: true },
      CFG
    );
    expect(out.nextState).toBe("IDLE");
  });

  it("PROCEED_TOWARD_PHONE with null yawErrorDeg -> IDLE (heading missing)", () => {
    const out = evaluateFollowMock(
      {
        state: "IDLE",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: 10,
          yawErrorDeg: null,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("IDLE");
    expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
  });

  it("PROCEED_TOWARD_PHONE with null distance -> IDLE", () => {
    const out = evaluateFollowMock(
      {
        state: "IDLE",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: null,
          yawErrorDeg: 0,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("IDLE");
  });

  it("IDLE with large +yaw -> ROTATE CW (M1+M4 up, M2+M3 down)", () => {
    const out = evaluateFollowMock(
      { state: "IDLE", snapshot: HEALTHY_FAR_RIGHT, running: true },
      CFG
    );
    expect(out.nextState).toBe("ROTATE");
    const [m1, m2, m3, m4] = out.motorThrottles;
    expect(m1).toBe(CFG.yawBias);
    expect(m4).toBe(CFG.yawBias);
    expect(m2).toBe(0); //base 0, -yawBias clamped to 0
    expect(m3).toBe(0);
  });

  it("IDLE with large -yaw -> ROTATE CCW (M2+M3 up, M1+M4 down)", () => {
    const out = evaluateFollowMock(
      { state: "IDLE", snapshot: HEALTHY_FAR_LEFT, running: true },
      CFG
    );
    expect(out.nextState).toBe("ROTATE");
    const [m1, m2, m3, m4] = out.motorThrottles;
    expect(m2).toBe(CFG.yawBias);
    expect(m3).toBe(CFG.yawBias);
    expect(m1).toBe(0);
    expect(m4).toBe(0);
  });

  it("IDLE with |yaw| <= rotateExit -> FORWARD (M1+M3 up, M2+M4 down)", () => {
    const out = evaluateFollowMock(
      { state: "IDLE", snapshot: HEALTHY_FAR, running: true },
      CFG
    );
    expect(out.nextState).toBe("FORWARD");
    const [m1, m2, m3, m4] = out.motorThrottles;
    expect(m1).toBe(CFG.forwardBias);
    expect(m3).toBe(CFG.forwardBias);
    expect(m2).toBe(0);
    expect(m4).toBe(0);
  });

  it("ROTATE -> FORWARD when |yaw| drops below rotateExit", () => {
    const yawJustInside = CFG.rotateExitDeg - 1;
    const out = evaluateFollowMock(
      {
        state: "ROTATE",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: 10,
          yawErrorDeg: yawJustInside,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("FORWARD");
  });

  it("FORWARD stays FORWARD inside hysteresis band (|yaw| between exit and reentry)", () => {
    const yawInBand = (CFG.rotateExitDeg + CFG.rotateReentryDeg) / 2; //e.g. 17.5
    const out = evaluateFollowMock(
      {
        state: "FORWARD",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: 10,
          yawErrorDeg: yawInBand,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("FORWARD");
  });

  it("FORWARD -> ROTATE when |yaw| exceeds rotateReentry", () => {
    const yawBeyond = CFG.rotateReentryDeg + 5;
    const out = evaluateFollowMock(
      {
        state: "FORWARD",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: 10,
          yawErrorDeg: yawBeyond,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("ROTATE");
  });

  it("distance <= arrivalRadius -> HOLD with zero throttles (from FORWARD)", () => {
    const out = evaluateFollowMock(
      { state: "FORWARD", snapshot: HEALTHY_NEAR, running: true },
      CFG
    );
    expect(out.nextState).toBe("HOLD");
    expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
  });

  it("HOLD stays HOLD while distance inside hysteresis band", () => {
    const insideBand = CFG.arrivalRadiusM + CFG.arrivalHysteresisM - 0.1;
    const out = evaluateFollowMock(
      {
        state: "HOLD",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: insideBand,
          yawErrorDeg: 0,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("HOLD");
    expect(out.motorThrottles).toEqual([0, 0, 0, 0]);
  });

  it("HOLD -> FORWARD when distance exceeds radius + hysteresis and yaw is good", () => {
    const beyond = CFG.arrivalRadiusM + CFG.arrivalHysteresisM + 1;
    const out = evaluateFollowMock(
      {
        state: "HOLD",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: beyond,
          yawErrorDeg: 0,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("FORWARD");
  });

  it("HOLD -> ROTATE when distance exceeds band and yaw exceeds reentry threshold", () => {
    const beyond = CFG.arrivalRadiusM + CFG.arrivalHysteresisM + 1;
    const yawBeyond = CFG.rotateReentryDeg + 10;
    const out = evaluateFollowMock(
      {
        state: "HOLD",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: beyond,
          yawErrorDeg: yawBeyond,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("ROTATE");
  });

  it("throttle stays within 0..255 with extreme bias config", () => {
    const out = evaluateFollowMock(
      {
        state: "IDLE",
        snapshot: HEALTHY_FAR_RIGHT,
        running: true,
      },
      { ...CFG, baseThrottle: 250, yawBias: 100 }
    );
    for (const v of out.motorThrottles) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    //base 250 + 100 = 350 -> clamp 255 ; base 250 - 100 = 150 unchanged
    expect(out.motorThrottles[0]).toBe(255);
    expect(out.motorThrottles[3]).toBe(255);
    expect(out.motorThrottles[1]).toBe(150);
    expect(out.motorThrottles[2]).toBe(150);
  });

  it("yawError exactly at rotateExit threshold treats threshold as exclusive (-> FORWARD)", () => {
    const out = evaluateFollowMock(
      {
        state: "IDLE",
        snapshot: snap({
          intent: "PROCEED_TOWARD_PHONE",
          distancePhoneToDrone_m: 10,
          yawErrorDeg: CFG.rotateExitDeg,
        }),
        running: true,
      },
      CFG
    );
    expect(out.nextState).toBe("FORWARD");
  });
});
