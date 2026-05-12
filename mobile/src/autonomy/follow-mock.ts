/**
 * Follow-Mock: open-loop autonomy that biases per-motor throttles based on
 * `NavigationSnapshot` (distance + yaw error). Pure logic, no React, no BLE.
 *
 * State machine:
 *   IDLE     -> stopped or no usable fixes; emits zeros
 *   ROTATE   -> drone needs to yaw to face phone; biases yaw motors
 *   FORWARD  -> drone is facing phone; biases nose-down motors
 *   HOLD     -> within arrival radius; emits zeros
 *
 * Motor map (from flight_control/main/main.c corner comments):
 *   M1 = Back-Left   (CCW)   M2 = Front-Left  (CW)
 *   M3 = Back-Right  (CW)    M4 = Front-Right (CCW)
 *
 * Motion biases (added to baseThrottle, clamped 0..255):
 *   YAW CW (turn right, yawError > 0)    : M1+, M4+ ; M2-, M3-   (CCW props spin faster)
 *   YAW CCW (turn left,  yawError < 0)   : M1-, M4- ; M2+, M3+
 *   FORWARD (tilt nose down, translate)  : M1+, M3+ ; M2-, M4-   (back motors spin faster)
 *
 * This is a bench demo. `flight_control` only honors SET_MOTOR while DISARMED,
 * so even if these throttles drive real motors they cannot produce flight.
 */

import type { NavigationSnapshot } from "../nav/types";

export type FollowState = "IDLE" | "ROTATE" | "FORWARD" | "HOLD";

export type FollowMockConfig = {
  /** distance (m) at which we consider "arrived" and stop motion */
  arrivalRadiusM: number;
  /** extra distance band beyond arrivalRadius before HOLD exits back to FORWARD */
  arrivalHysteresisM: number;
  /** abs yaw error (deg) below which ROTATE transitions to FORWARD */
  rotateExitDeg: number;
  /** abs yaw error (deg) above which FORWARD transitions back to ROTATE */
  rotateReentryDeg: number;
  /** common motor throttle (0..255) added before motion biases */
  baseThrottle: number;
  /** motor throttle delta (0..255) used for yaw mix */
  yawBias: number;
  /** motor throttle delta (0..255) used for forward mix */
  forwardBias: number;
};

export const DEFAULT_FOLLOW_MOCK_CONFIG: FollowMockConfig = {
  arrivalRadiusM: 3.0,
  arrivalHysteresisM: 0.5,
  rotateExitDeg: 10,
  rotateReentryDeg: 25,
  baseThrottle: 0,
  yawBias: 40,
  forwardBias: 40,
};

export type FollowMockInputs = {
  state: FollowState;
  snapshot: NavigationSnapshot;
  running: boolean;
};

export type MotorThrottles = readonly [number, number, number, number];

export type FollowMockOutput = {
  nextState: FollowState;
  motorThrottles: MotorThrottles;
  /** human-readable reason for the chosen state/output — useful for UI debug */
  reason: string;
};

const ZERO_THROTTLES: MotorThrottles = [0, 0, 0, 0];

function clamp255(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

function isHealthy(snapshot: NavigationSnapshot): boolean {
  switch (snapshot.intent) {
    case "AWAITING_PHONE_FIX":
    case "AWAITING_DRONE_FIX":
    case "WEAK_PHONE_GPS":
    case "HOLD":
      return false;
    case "PROCEED_TOWARD_PHONE":
    case "ARRIVED_OR_WITHIN_RADIUS":
      break;
  }
  if (snapshot.distancePhoneToDrone_m == null) return false;
  if (snapshot.yawErrorDeg == null) return false;
  return true;
}

function mixRotate(yawSign: 1 | -1, cfg: FollowMockConfig): MotorThrottles {
  const base = cfg.baseThrottle;
  const y = cfg.yawBias * yawSign;
  // +yawSign (CW): M1+, M2-, M3-, M4+  (CCW props M1/M4 spin faster -> body yaws CW)
  return [
    clamp255(base + y),
    clamp255(base - y),
    clamp255(base - y),
    clamp255(base + y),
  ];
}

function mixForward(cfg: FollowMockConfig): MotorThrottles {
  const base = cfg.baseThrottle;
  const f = cfg.forwardBias;
  // M1+ (BL), M2- (FL), M3+ (BR), M4- (FR) -> back motors spin faster -> nose tilts down
  return [
    clamp255(base + f),
    clamp255(base - f),
    clamp255(base + f),
    clamp255(base - f),
  ];
}

function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "?";
}

export function evaluateFollowMock(
  inputs: FollowMockInputs,
  cfg: FollowMockConfig = DEFAULT_FOLLOW_MOCK_CONFIG
): FollowMockOutput {
  const { state, snapshot, running } = inputs;

  if (!running) {
    return { nextState: "IDLE", motorThrottles: ZERO_THROTTLES, reason: "stopped" };
  }
  if (!isHealthy(snapshot)) {
    return {
      nextState: "IDLE",
      motorThrottles: ZERO_THROTTLES,
      reason: `unhealthy: ${snapshot.intent}`,
    };
  }

  // Both are non-null per isHealthy.
  const distance = snapshot.distancePhoneToDrone_m as number;
  const yawError = snapshot.yawErrorDeg as number;
  const absYaw = Math.abs(yawError);

  // HOLD: stay until distance exceeds radius + hysteresis (avoids edge flicker).
  if (state === "HOLD") {
    if (distance > cfg.arrivalRadiusM + cfg.arrivalHysteresisM) {
      if (absYaw > cfg.rotateReentryDeg) {
        return {
          nextState: "ROTATE",
          motorThrottles: mixRotate(yawError >= 0 ? 1 : -1, cfg),
          reason: `hold->rotate dist=${fmt(distance)}m yaw=${fmt(yawError, 1)}°`,
        };
      }
      return {
        nextState: "FORWARD",
        motorThrottles: mixForward(cfg),
        reason: `hold->forward dist=${fmt(distance)}m`,
      };
    }
    return {
      nextState: "HOLD",
      motorThrottles: ZERO_THROTTLES,
      reason: `holding dist=${fmt(distance)}m`,
    };
  }

  // Arrived check (works from IDLE / ROTATE / FORWARD).
  if (distance <= cfg.arrivalRadiusM) {
    return {
      nextState: "HOLD",
      motorThrottles: ZERO_THROTTLES,
      reason: `arrived dist=${fmt(distance)}m`,
    };
  }

  // Rotate threshold: exit-band when newly rotating, larger re-entry band when
  // already in FORWARD so we don't oscillate ROTATE<->FORWARD near the edge.
  const rotateThreshold = state === "FORWARD" ? cfg.rotateReentryDeg : cfg.rotateExitDeg;
  if (absYaw > rotateThreshold) {
    return {
      nextState: "ROTATE",
      motorThrottles: mixRotate(yawError >= 0 ? 1 : -1, cfg),
      reason: `rotate yaw=${fmt(yawError, 1)}°`,
    };
  }

  return {
    nextState: "FORWARD",
    motorThrottles: mixForward(cfg),
    reason: `forward dist=${fmt(distance)}m yaw=${fmt(yawError, 1)}°`,
  };
}
