//public barrel for follow-to-phone nav

export type {
  DroneFix,
  GpsFix,
  NavigationConfig,
  NavigationIntent,
  NavigationSnapshot,
  PhoneFix,
} from "./types";
export { DEFAULT_NAV_CONFIG } from "./types";

export {
  enuFromAnchor,
  haversineDistanceM,
  initialBearingDeg,
  isValidLatLon,
  toDegrees,
  toRadians,
} from "./geo";
export type { LatLon } from "./geo";

export { createFollowToPhoneNavigator } from "./navigator";
export type { FollowToPhoneNavigator, NavigatorInputs } from "./navigator";

export {
  NullDroneProvider,
  SyntheticDroneProvider,
  TelemetryDroneProvider,
} from "./drone-position-provider";
export type {
  DroneFixCallback,
  DronePositionProvider,
  DroneProviderUnsubscribe,
  TelemetrySource,
  TelemetryWithDroneGps,
} from "./drone-position-provider";

export { createPhoneFixSource } from "./phone-fix-source";
export type { PhoneFixCallback, PhoneFixSource, PhoneFixSourceOptions } from "./phone-fix-source";

export { useFollowToPhoneNavigation } from "./use-follow-to-phone-navigation";
export type { UseFollowToPhoneNavigationOptions } from "./use-follow-to-phone-navigation";
