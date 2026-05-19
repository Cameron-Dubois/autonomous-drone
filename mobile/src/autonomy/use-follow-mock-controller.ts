/**
 * useFollowMockController — runtime glue around `evaluateFollowMock`.
 *
 * Drives the pure follow-mock state machine on a fixed-rate interval, sending
 * per-motor SET_MOTOR_N writes over the existing DroneComms transport. Pairs
 * with `useFollowToPhoneNavigation` for the NavigationSnapshot input.
 *
 * Safety:
 *   - NEVER sends ARM. `flight_control` only honors SET_MOTOR while DISARMED
 *     (bench mode), so these biased throttles can never produce flight.
 *   - On stop / unmount / watchdog trip, forces a single zero-write to every
 *     motor so a previously biased motor cannot keep spinning.
 *   - Watchdog: if the snapshot has not been refreshed for STALE_SNAPSHOT_MS
 *     (default 1500 ms), the next tick treats `running` as false, which makes
 *     the evaluator emit IDLE + zeros.
 *
 * Emission for drone UART demos:
 *   - Every tick echoes the evaluator's NAV_* (`navIntentCommandId`) and ALL four
 *     SET_MOTOR packets so telemetry matches the app's motor sliders.
 *   - Prefer `sendBytesBleOnly` when present (`HybridComms`) so mirrored traffic stays
 *     on BLE; otherwise `sendBytes` (mixed transport).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DroneComms } from "../comms/comms";
import { buildCommandBytes, buildRawCommandBytes, DroneCmd, navIntentCommandId } from "../prototype/types";
import type { NavigationSnapshot } from "../nav/types";

import {
  DEFAULT_FOLLOW_MOCK_CONFIG,
  evaluateFollowMock,
  type FollowMockConfig,
  type FollowState,
  type MotorThrottles,
} from "./follow-mock";

const DEFAULT_TICK_HZ = 10;
const STALE_SNAPSHOT_MS = 1500;

const MOTOR_CMDS: readonly number[] = [
  DroneCmd.SET_MOTOR_1,
  DroneCmd.SET_MOTOR_2,
  DroneCmd.SET_MOTOR_3,
  DroneCmd.SET_MOTOR_4,
];

const ZERO_THROTTLES: MotorThrottles = [0, 0, 0, 0];

/** Prefer BLE-only uplink (`HybridComms`) so drone serial logs mirror the Follow UI. */
export type FollowMockCommsLike = Pick<DroneComms, "sendBytes"> &
  Partial<Pick<DroneComms, "send">> & {
    sendBytesBleOnly?(bytes: Uint8Array): Promise<void>;
  };

function dispatchFollowPacket(c: FollowMockCommsLike, bytes: Uint8Array): void {
  if (typeof c.sendBytesBleOnly === "function") void c.sendBytesBleOnly(bytes);
  else void c.sendBytes(bytes);
}

export type UseFollowMockControllerOptions = {
  snapshot: NavigationSnapshot;
  comms: FollowMockCommsLike;
  config?: Partial<FollowMockConfig>;
  /** Default 10. Clamped to >= 1. */
  tickHz?: number;
  /** Override wall clock — used by tests. */
  now?: () => number;
  /** Watchdog threshold. Default 1500 ms. */
  staleSnapshotMs?: number;
};

export type FollowMockControllerView = {
  state: FollowState;
  running: boolean;
  motorThrottles: MotorThrottles;
  reason: string;
  start: () => void;
  stop: () => void;
};

function mergeConfig(partial?: Partial<FollowMockConfig>): FollowMockConfig {
  return partial ? { ...DEFAULT_FOLLOW_MOCK_CONFIG, ...partial } : DEFAULT_FOLLOW_MOCK_CONFIG;
}

export function useFollowMockController(
  opts: UseFollowMockControllerOptions
): FollowMockControllerView {
  const { tickHz = DEFAULT_TICK_HZ, staleSnapshotMs = STALE_SNAPSHOT_MS } = opts;

  // Live refs read inside the interval (no re-renders trigger interval recreation).
  const snapshotRef = useRef<NavigationSnapshot>(opts.snapshot);
  snapshotRef.current = opts.snapshot;

  const commsRef = useRef<FollowMockCommsLike>(opts.comms);
  commsRef.current = opts.comms;

  const cfgRef = useRef<FollowMockConfig>(mergeConfig(opts.config));
  cfgRef.current = mergeConfig(opts.config);

  const nowRef = useRef<() => number>(opts.now ?? (() => Date.now()));
  nowRef.current = opts.now ?? (() => Date.now());

  const stateRef = useRef<FollowState>("IDLE");
  const lastThrottlesRef = useRef<MotorThrottles>(ZERO_THROTTLES);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<{
    state: FollowState;
    running: boolean;
    throttles: MotorThrottles;
    reason: string;
  }>({ state: "IDLE", running: false, throttles: ZERO_THROTTLES, reason: "idle" });

  const sendMotorsDisplayed = useCallback((throttles: MotorThrottles) => {
    const c = commsRef.current;
    for (let i = 0; i < 4; i++) {
      dispatchFollowPacket(c, buildRawCommandBytes(MOTOR_CMDS[i], [throttles[i]]));
    }
    lastThrottlesRef.current = throttles;
  }, []);

  const sendNavIntent = useCallback((phase: FollowState, yawErrorDeg: number | null) => {
    const cmdId = navIntentCommandId(phase, yawErrorDeg);
    if (cmdId == null) return;
    dispatchFollowPacket(commsRef.current, buildRawCommandBytes(cmdId, []));
  }, []);

  const tick = useCallback(() => {
    const snap = snapshotRef.current;
    const cfg = cfgRef.current;
    const nowMs = nowRef.current();

    // Watchdog: if snapshot looks stale, force IDLE+zeros via the evaluator.
    const fresh =
      snap.generatedAtMs > 0 ? nowMs - snap.generatedAtMs <= staleSnapshotMs : true;

    const out = evaluateFollowMock(
      { state: stateRef.current, snapshot: snap, running: fresh },
      cfg
    );

    sendNavIntent(out.nextState, snap.yawErrorDeg);

    stateRef.current = out.nextState;
    sendMotorsDisplayed(out.motorThrottles);

    setView({
      state: out.nextState,
      running: true,
      throttles: out.motorThrottles,
      reason: fresh ? out.reason : "watchdog: snapshot stale",
    });
  }, [sendMotorsDisplayed, sendNavIntent, staleSnapshotMs]);

  const start = useCallback(() => {
    if (intervalRef.current != null) return;
    dispatchFollowPacket(commsRef.current, buildCommandBytes({ type: "FOLLOW_TOGGLE" }));
    stateRef.current = "IDLE";
    lastThrottlesRef.current = ZERO_THROTTLES;
    const periodMs = Math.max(10, Math.round(1000 / Math.max(1, tickHz)));
    intervalRef.current = setInterval(tick, periodMs);
    setView({
      state: "IDLE",
      running: true,
      throttles: ZERO_THROTTLES,
      reason: "starting",
    });
  }, [tick, tickHz]);

  const stop = useCallback(() => {
    const hadSession = intervalRef.current != null;
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (hadSession) {
      dispatchFollowPacket(commsRef.current, buildCommandBytes({ type: "FOLLOW_TOGGLE" }));
    }
    const wasActive = stateRef.current !== "IDLE";
    // Mirror full zero quartet on BLE / transport.
    sendMotorsDisplayed(ZERO_THROTTLES);
    if (wasActive) {
      sendNavIntent("IDLE", null);
    }
    stateRef.current = "IDLE";
    setView({
      state: "IDLE",
      running: false,
      throttles: ZERO_THROTTLES,
      reason: "stopped",
    });
  }, [sendMotorsDisplayed, sendNavIntent]);

  // Unmount: clear interval; pair FOLLOW_TOGGLE like stop(); zero motors and NAV_IDLE.
  useEffect(() => {
    return () => {
      const hadSession = intervalRef.current != null;
      if (hadSession) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        dispatchFollowPacket(commsRef.current, buildCommandBytes({ type: "FOLLOW_TOGGLE" }));
      }
      const wasActive = stateRef.current !== "IDLE";
      sendMotorsDisplayed(ZERO_THROTTLES);
      if (wasActive) {
        sendNavIntent("IDLE", null);
      }
    };
  }, [sendMotorsDisplayed, sendNavIntent]);

  return {
    state: view.state,
    running: view.running,
    motorThrottles: view.throttles,
    reason: view.reason,
    start,
    stop,
  };
}
