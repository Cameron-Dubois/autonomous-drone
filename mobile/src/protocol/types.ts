/** Command IDs matching drone_ble/main/bleprph.h drone_cmd_id_t */
export const DroneCmd = {
  NOP:            0x00,
  ARM:            0x01,
  DISARM:         0x02,
  ESTOP:          0x03,
  SET_MOTOR_1:    0x10,
  SET_MOTOR_2:    0x11,
  SET_MOTOR_3:    0x12,
  SET_MOTOR_4:    0x13,
  HEARTBEAT:      0x20,
  ASCEND:         0x30,
  DESCEND:        0x31,
  FOLLOW_TOGGLE:  0x32,
} as const;

export type Command =
  | { type: "FOLLOW_TOGGLE" }
  | { type: "ASCEND" }
  | { type: "DESCEND" }
  | { type: "ESTOP" }
  | { type: "ARM" }
  | { type: "DISARM" }
  | { type: "TAKEOFF" }
  | { type: "LAND" }
  | { type: "HOVER" }
  | { type: "RETURN_HOME" }
  | { type: "SET_MOTOR"; motor: 1 | 2 | 3 | 4; throttle: number }
  | { type: "HEARTBEAT" }
  | { type: "NOP" };

const CMD_TYPE_TO_ID: Record<string, number> = {
  NOP:            DroneCmd.NOP,
  ARM:            DroneCmd.ARM,
  DISARM:         DroneCmd.DISARM,
  ESTOP:          DroneCmd.ESTOP,
  HEARTBEAT:      DroneCmd.HEARTBEAT,
  ASCEND:         DroneCmd.ASCEND,
  DESCEND:        DroneCmd.DESCEND,
  FOLLOW_TOGGLE:  DroneCmd.FOLLOW_TOGGLE,
  TAKEOFF:        DroneCmd.ARM,
  LAND:           DroneCmd.DISARM,
  HOVER:          DroneCmd.NOP,
  RETURN_HOME:    DroneCmd.NOP,
};

let _seq = 0;
function nextSeq(): number {
  const s = _seq;
  _seq = (_seq + 1) & 0xff;
  return s;
}

/**
 * Build a binary command buffer matching the ESP32 drone_cmd_t format:
 *   [seq, cmd_id, payload_len, ...payload]
 */
export function buildCommandBytes(cmd: Command): Uint8Array {
  const seq = nextSeq();

  if (cmd.type === "SET_MOTOR") {
    const motorCmdId = [0, DroneCmd.SET_MOTOR_1, DroneCmd.SET_MOTOR_2, DroneCmd.SET_MOTOR_3, DroneCmd.SET_MOTOR_4][cmd.motor];
    const throttle = Math.max(0, Math.min(255, Math.round(cmd.throttle)));
    return new Uint8Array([seq, motorCmdId, 1, throttle]);
  }

  const cmdId = CMD_TYPE_TO_ID[cmd.type] ?? DroneCmd.NOP;
  return new Uint8Array([seq, cmdId, 0]);
}

/**
 * Build a raw binary command from a command ID and optional payload bytes.
 */
export function buildRawCommandBytes(cmdId: number, payload?: number[]): Uint8Array {
  const seq = nextSeq();
  const p = payload ?? [];
  return new Uint8Array([seq, cmdId & 0xff, p.length, ...p]);
}

export type LinkStatus = "DISCONNECTED" | "CONNECTING" | "SECURE_LINK";

/** Live state from the drone (BLE JSON/TEL). Legacy speed/alt kept until firmware drops them. */
export type Telemetry = {
  link: LinkStatus;
  batteryPct: number;
  batteryMins: number;
  speedKmh: number;
  altM: number;
  rssiBars: 0 | 1 | 2 | 3 | 4;
  followMode: boolean;

  /** From ESP32 `gps_fix_t.valid` / GNSS fix indication */
  droneGpsValid: boolean;
  /** WGS84 decimal degrees; null when no fix or not yet reported */
  droneLat: number | null;
  droneLon: number | null;
  /** NMEA GGA–style fix quality; 0 when invalid or unknown */
  droneGpsFixQuality: number;
  /** In-view / used satellite count from fix; 0 when unknown */
  droneGpsSatellites: number;
  /** HDOP from fix; null when unknown */
  droneGpsHdop: number | null;
  /** Drone-reported heading in degrees [0,360); semantics (true vs magnetic) defined by firmware. null when unknown. */
  droneHeadingDeg: number | null;
};

/** Initial / disconnected telemetry; use everywhere a full `Telemetry` object is required. */
export function createDefaultTelemetry(): Telemetry {
  return {
    link: "DISCONNECTED",
    batteryPct: 0,
    batteryMins: 0,
    speedKmh: 0,
    altM: 0,
    rssiBars: 0,
    followMode: false,
    droneGpsValid: false,
    droneLat: null,
    droneLon: null,
    droneGpsFixQuality: 0,
    droneGpsSatellites: 0,
    droneGpsHdop: null,
    droneHeadingDeg: null,
  };
}
