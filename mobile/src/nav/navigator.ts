//pure follow-to-phone logic; outputs snapshot only, never sends commands

import { haversineDistanceM, initialBearingDeg, isValidLatLon } from "./geo";
import {
  DEFAULT_NAV_CONFIG,
  type DroneFix,
  type NavigationConfig,
  type NavigationIntent,
  type NavigationSnapshot,
  type PhoneFix,
} from "./types";

export type NavigatorInputs = {
  phoneFix: PhoneFix | null;
  droneFix: DroneFix | null;
  //tests can fix time
  nowMs?: number;
};

export type FollowToPhoneNavigator = {
  evaluate(inputs: NavigatorInputs): NavigationSnapshot;
};

export function createFollowToPhoneNavigator(
  config: NavigationConfig = DEFAULT_NAV_CONFIG
): FollowToPhoneNavigator {
  let prevWithinArrival = false;

  return {
    evaluate({ phoneFix, droneFix, nowMs }: NavigatorInputs): NavigationSnapshot {
      const t = nowMs ?? Date.now();
      const cleanPhone = isUsableFix(phoneFix, t, config) ? phoneFix : null;
      const cleanDrone = isUsableFix(droneFix, t, config) ? droneFix : null;

      let distance: number | null = null;
      let bearing: number | null = null;
      if (cleanPhone && cleanDrone) {
        distance = haversineDistanceM(cleanDrone, cleanPhone);
        bearing = initialBearingDeg(cleanDrone, cleanPhone);
      }

      const withinArrival =
        distance != null &&
        distance <= config.arrivalRadiusM + (prevWithinArrival ? config.arrivalHysteresisM : 0);

      const intent = decideIntent({
        phoneFix: cleanPhone,
        droneFix: cleanDrone,
        distance,
        config,
        withinArrival,
      });

      prevWithinArrival = withinArrival;

      return {
        intent,
        distancePhoneToDrone_m: distance,
        bearingDroneToPhone_deg: bearing,
        phoneFix: cleanPhone,
        droneFix: cleanDrone,
        withinArrival,
        generatedAtMs: t,
      };
    },
  };
}

function isUsableFix(fix: PhoneFix | DroneFix | null, nowMs: number, config: NavigationConfig): boolean {
  if (!fix) return false;
  if (!isValidLatLon(fix)) return false;
  if (!Number.isFinite(fix.timestampMs)) return false;
  if (nowMs - fix.timestampMs > config.maxFixAgeMs) return false;
  return true;
}

function decideIntent(args: {
  phoneFix: PhoneFix | null;
  droneFix: DroneFix | null;
  distance: number | null;
  config: NavigationConfig;
  withinArrival: boolean;
}): NavigationIntent {
  const { phoneFix, droneFix, distance, config, withinArrival } = args;

  if (!phoneFix) return "AWAITING_PHONE_FIX";

  if (
    config.maxPhoneAccuracyM != null &&
    phoneFix.accuracyM != null &&
    phoneFix.accuracyM > config.maxPhoneAccuracyM
  ) {
    return "WEAK_PHONE_GPS";
  }

  if (!droneFix) return "AWAITING_DRONE_FIX";
  if (distance == null) return "HOLD";
  if (withinArrival) return "ARRIVED_OR_WITHIN_RADIUS";
  return "PROCEED_TOWARD_PHONE";
}
