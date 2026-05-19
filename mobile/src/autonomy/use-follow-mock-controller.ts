/**
 * useFollowMockController — runtime glue around `evaluateFollowMock`.
 *
 * BLE demo: sends a single NAV_* opcode that matches the Home “Follow phase” chip
 * (same labels as FollowState — see `followDisplayToBleOpcode` mapping below).
 * Emits only when the displayed phase changes → quiet link, drone UART still readable.
 *
 * Pairs with `useFollowToPhoneNavigation` for the NavigationSnapshot input; motor
 * throttles in `motorThrottles` stay for UI sliders only — not mirrored over BLE.
 *
 * Prefer `sendBytesBleOnly` when present (`HybridComms`) so traffic stays on BLE.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DroneComms } from "../comms/comms";
import { buildRawCommandBytes, DroneCmd, navIntentCommandId } from "../prototype/types";
import type { NavigationSnapshot } from "../nav/types";

import {
  DEFAULT_FOLLOW_MOCK_CONFIG,
  evaluateFollowMock,
  type FollowMockConfig,
  type FollowState,
  type MotorThrottles,
} from "./follow-mock";

/** Home Follow chip ↔ drone BLE opcode wiring (intent-only for UART visibility). */
function followDisplayToBleOpcode(state: FollowState, yawErrorDeg: number | null): number | null {
  return navIntentCommandId(state, yawErrorDeg);
}

const DEFAULT_TICK_HZ = 10;
const STALE_SNAPSHOT_MS = 1500;

const ZERO_THROTTLES: MotorThrottles = [0, 0, 0, 0];

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

export function useFollowMockController(opts: UseFollowMockControllerOptions): FollowMockControllerView {
  const { tickHz = DEFAULT_TICK_HZ, staleSnapshotMs = STALE_SNAPSHOT_MS } = opts;

  const snapshotRef = useRef<NavigationSnapshot>(opts.snapshot);
  snapshotRef.current = opts.snapshot;

  const commsRef = useRef<FollowMockCommsLike>(opts.comms);
  commsRef.current = opts.comms;

  const cfgRef = useRef<FollowMockConfig>(mergeConfig(opts.config));
  cfgRef.current = mergeConfig(opts.config);

  const nowRef = useRef<() => number>(opts.now ?? (() => Date.now()));
  nowRef.current = opts.now ?? (() => Date.now());

  const stateRef = useRef<FollowState>("IDLE");
  /** Last NAV opcode sent on BLE; omit resends while chip text / intent unchanged. */
  const lastBleOpcodeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<{
    state: FollowState;
    running: boolean;
    throttles: MotorThrottles;
    reason: string;
  }>({ state: "IDLE", running: false, throttles: ZERO_THROTTLES, reason: "idle" });

  const sendBleFollowPhaseIfChanged = useCallback((state: FollowState, yawErrorDeg: number | null) => {
    const cmdId = followDisplayToBleOpcode(state, yawErrorDeg);
    if (cmdId == null || cmdId === lastBleOpcodeRef.current) return;
    dispatchFollowPacket(commsRef.current, buildRawCommandBytes(cmdId, []));
    lastBleOpcodeRef.current = cmdId;
  }, []);

  const sendBleNavIdleAlways = useCallback(() => {
    dispatchFollowPacket(commsRef.current, buildRawCommandBytes(DroneCmd.NAV_IDLE, []));
    lastBleOpcodeRef.current = DroneCmd.NAV_IDLE;
  }, []);

  const tick = useCallback(() => {
    const snap = snapshotRef.current;
    const cfg = cfgRef.current;
    const nowMs = nowRef.current();

    const fresh =
      snap.generatedAtMs > 0 ? nowMs - snap.generatedAtMs <= staleSnapshotMs : true;

    const out = evaluateFollowMock(
      { state: stateRef.current, snapshot: snap, running: fresh },
      cfg
    );

    sendBleFollowPhaseIfChanged(out.nextState, snap.yawErrorDeg);

    stateRef.current = out.nextState;

    setView({
      state: out.nextState,
      running: true,
      throttles: out.motorThrottles,
      reason: fresh ? out.reason : "watchdog: snapshot stale",
    });
  }, [sendBleFollowPhaseIfChanged, staleSnapshotMs]);

  const start = useCallback(() => {
    if (intervalRef.current != null) return;
    stateRef.current = "IDLE";
    lastBleOpcodeRef.current = null;
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
    const wasActive = stateRef.current !== "IDLE";
    if (hadSession && wasActive) {
      sendBleNavIdleAlways();
    }
    stateRef.current = "IDLE";
    lastBleOpcodeRef.current = null;
    setView({
      state: "IDLE",
      running: false,
      throttles: ZERO_THROTTLES,
      reason: "stopped",
    });
  }, [sendBleNavIdleAlways]);

  useEffect(() => {
    return () => {
      const hadSession = intervalRef.current != null;
      if (hadSession) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
      const wasActive = stateRef.current !== "IDLE";
      if (hadSession && wasActive) {
        sendBleNavIdleAlways();
      }
      lastBleOpcodeRef.current = null;
    };
  }, [sendBleNavIdleAlways]);

  return {
    state: view.state,
    running: view.running,
    motorThrottles: view.throttles,
    reason: view.reason,
    start,
    stop,
  };
}
