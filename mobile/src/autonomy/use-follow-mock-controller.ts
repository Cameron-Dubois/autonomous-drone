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
 * Diff dispatch: only sends a SET_MOTOR write when that motor's throttle has
 * actually changed since the previous tick. Keeps the BLE link quiet between
 * state transitions.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DroneComms } from "../comms/comms";
import { buildRawCommandBytes, DroneCmd } from "../protocol/types";
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

export type FollowMockCommsLike = Pick<DroneComms, "sendBytes">;

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

  const sendThrottles = useCallback((throttles: MotorThrottles, force: boolean) => {
    const c = commsRef.current;
    const prev = lastThrottlesRef.current;
    for (let i = 0; i < 4; i++) {
      if (force || throttles[i] !== prev[i]) {
        void c.sendBytes(buildRawCommandBytes(MOTOR_CMDS[i], [throttles[i]]));
      }
    }
    lastThrottlesRef.current = throttles;
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

    stateRef.current = out.nextState;
    sendThrottles(out.motorThrottles, false);

    setView({
      state: out.nextState,
      running: true,
      throttles: out.motorThrottles,
      reason: fresh ? out.reason : "watchdog: snapshot stale",
    });
  }, [sendThrottles, staleSnapshotMs]);

  const start = useCallback(() => {
    if (intervalRef.current != null) return;
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
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Force-write zeros so a biased motor cannot keep spinning after stop.
    sendThrottles(ZERO_THROTTLES, true);
    stateRef.current = "IDLE";
    setView({
      state: "IDLE",
      running: false,
      throttles: ZERO_THROTTLES,
      reason: "stopped",
    });
  }, [sendThrottles]);

  // Unmount: clear interval, send final zero-write defensively.
  useEffect(() => {
    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      sendThrottles(ZERO_THROTTLES, true);
    };
  }, [sendThrottles]);

  return {
    state: view.state,
    running: view.running,
    motorThrottles: view.throttles,
    reason: view.reason,
    start,
    stop,
  };
}
