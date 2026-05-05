//follow-to-phone nav types; semantic output only (real TX lives in firmware-command-mapper later)

//GNSS point from phone or drone
export type GpsFix = {
  //decimal degrees WGS84
  lat: number;
  //decimal degrees WGS84
  lon: number;
  //epoch ms or monotonic ms, stay consistent in one session
  timestampMs: number;
  //1-sigma horizontal error m if OS gives it
  accuracyM?: number | null;
  //meters if present
  altitudeM?: number | null;
  //degrees true 0..360 if present
  courseDeg?: number | null;
  //m/s if present
  speedMps?: number | null;
};

export type PhoneFix = GpsFix;
export type DroneFix = GpsFix;

//high level state the UI or a future mapper reads; not wire commands
export type NavigationIntent =
  | "AWAITING_PHONE_FIX"
  | "AWAITING_DRONE_FIX"
  | "WEAK_PHONE_GPS"
  | "ARRIVED_OR_WITHIN_RADIUS"
  | "PROCEED_TOWARD_PHONE"
  | "HOLD";

export type NavigationConfig = {
  //drone "at phone" when distance below this m
  arrivalRadiusM: number;
  //extra m band so arrived does not flicker at the edge
  arrivalHysteresisM: number;
  //reject phone fix if accuracy worse than this; null turns check off
  maxPhoneAccuracyM: number | null;
  //drop fixes older than this ms
  maxFixAgeMs: number;
};

export const DEFAULT_NAV_CONFIG: NavigationConfig = {
  arrivalRadiusM: 5,
  arrivalHysteresisM: 2,
  maxPhoneAccuracyM: 25,
  maxFixAgeMs: 8_000,
};

export type NavigationSnapshot = {
  intent: NavigationIntent;
  //null if we lack a good phone or drone fix
  distancePhoneToDrone_m: number | null;
  //true deg drone toward phone; null if unknown
  bearingDroneToPhone_deg: number | null;
  //last phone fix that passed checks
  phoneFix: PhoneFix | null;
  //last drone fix that passed checks
  droneFix: DroneFix | null;
  //true if inside arrival radius using hysteresis
  withinArrival: boolean;
  //navigator clock when we built this
  generatedAtMs: number;
};
