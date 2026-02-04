export type Command =
  | { type: "FOLLOW_TOGGLE" }
  | { type: "ASCEND" }
  | { type: "DESCEND" }
  | { type: "ESTOP" };

export type LinkStatus = "DISCONNECTED" | "CONNECTING" | "SECURE_LINK";

export type Telemetry = {
  link: LinkStatus;
  batteryPct: number;
  batteryMins: number;
  speedKmh: number;
  altM: number;
  rssiBars: 0 | 1 | 2 | 3 | 4;
  followMode: boolean;
};
