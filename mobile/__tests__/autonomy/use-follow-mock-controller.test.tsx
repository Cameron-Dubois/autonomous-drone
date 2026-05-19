import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { buildCommandBytes, DroneCmd, type Command } from "../../src/prototype/types";
import type { NavigationSnapshot } from "../../src/nav/types";
import {
  useFollowMockController,
  type FollowMockCommsLike,
  type FollowMockControllerView,
} from "../../src/autonomy/use-follow-mock-controller";

let MOCK_NOW = 1_000_000;

function snap(over: Partial<NavigationSnapshot> & Pick<NavigationSnapshot, "intent">): NavigationSnapshot {
  return {
    intent: over.intent,
    distancePhoneToDrone_m: over.distancePhoneToDrone_m ?? null,
    bearingDroneToPhone_deg: over.bearingDroneToPhone_deg ?? null,
    yawErrorDeg: over.yawErrorDeg ?? null,
    phoneFix: over.phoneFix ?? null,
    droneFix: over.droneFix ?? null,
    withinArrival: over.withinArrival ?? false,
    generatedAtMs: over.generatedAtMs ?? MOCK_NOW,
  };
}

const ROTATE_RIGHT = (): NavigationSnapshot =>
  snap({
    intent: "PROCEED_TOWARD_PHONE",
    distancePhoneToDrone_m: 10,
    bearingDroneToPhone_deg: 90,
    yawErrorDeg: 45,
    generatedAtMs: MOCK_NOW,
  });

const FORWARD_ALIGNED = (): NavigationSnapshot =>
  snap({
    intent: "PROCEED_TOWARD_PHONE",
    distancePhoneToDrone_m: 10,
    bearingDroneToPhone_deg: 0,
    yawErrorDeg: 0,
    generatedAtMs: MOCK_NOW,
  });

const TOO_CLOSE = (): NavigationSnapshot =>
  snap({
    intent: "PROCEED_TOWARD_PHONE",
    distancePhoneToDrone_m: 1.0,
    bearingDroneToPhone_deg: 0,
    yawErrorDeg: 0,
    generatedAtMs: MOCK_NOW,
  });

const AWAITING = (): NavigationSnapshot =>
  snap({ intent: "AWAITING_DRONE_FIX", generatedAtMs: MOCK_NOW });

type Captured = { latest: FollowMockControllerView | null };

function makeProbe(captured: Captured) {
  return function Probe(props: {
    snapshot: NavigationSnapshot;
    comms: FollowMockCommsLike;
    tickHz?: number;
    staleSnapshotMs?: number;
  }) {
    const view = useFollowMockController({
      snapshot: props.snapshot,
      comms: props.comms,
      tickHz: props.tickHz,
      staleSnapshotMs: props.staleSnapshotMs,
      now: () => MOCK_NOW,
    });
    captured.latest = view;
    return null;
  };
}

function mockComms(): FollowMockCommsLike & { sent: Uint8Array[] } {
  const sent: Uint8Array[] = [];
  const push = jest.fn(async (b: Uint8Array) => {
    sent.push(b);
  });
  return {
    sent,
    sendBytesBleOnly: push,
    sendBytes: push,
    send: jest.fn(async (cmd: Command) => {
      sent.push(buildCommandBytes(cmd));
    }),
  };
}

/** Decode a SET_MOTOR_N packet -> { motorIndex0Based, throttle }. */
function decodeMotorPacket(b: Uint8Array): { idx: number; throttle: number } {
  // [seq, cmdId, len, throttle]
  const cmdId = b[1];
  const idx = cmdId - DroneCmd.SET_MOTOR_1;
  const throttle = b[3];
  return { idx, throttle };
}

function isMotorCmd(cmdId: number): boolean {
  return cmdId >= DroneCmd.SET_MOTOR_1 && cmdId <= DroneCmd.SET_MOTOR_4;
}

function navCmdIds(bytes: Uint8Array[]): number[] {
  return bytes.filter((b) => !isMotorCmd(b[1])).map((b) => b[1]);
}

beforeEach(() => {
  jest.useFakeTimers();
  MOCK_NOW = 1_000_000;
});
afterEach(() => {
  jest.useRealTimers();
});

describe("useFollowMockController", () => {
  it("does not start ticking until start() is called", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    act(() => {
      TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(comms.sent.length).toBe(0);
    expect(captured.latest!.running).toBe(false);
    expect(captured.latest!.state).toBe("IDLE");
  });

  it("start() then one tick dispatches per-motor SET_MOTOR writes for ROTATE mix", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });

    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    // First tick from IDLE with +yaw 45 -> ROTATE CW: M1+M4 = 40, M2+M3 = 0.
    const motorPkts = comms.sent.filter((b) => isMotorCmd(b[1])).map(decodeMotorPacket);
    expect(motorPkts.length).toBe(4);
    const byIdx = new Map<number, number>();
    for (const d of motorPkts) byIdx.set(d.idx, d.throttle);
    expect(byIdx.get(0)).toBe(40); // M1
    expect(byIdx.get(1)).toBe(0); // M2
    expect(byIdx.get(2)).toBe(0); // M3
    expect(byIdx.get(3)).toBe(40); // M4
    expect(captured.latest!.state).toBe("ROTATE");

    act(() => {
      tr!.unmount();
    });
  });

  it("IDLE -> ROTATE transition emits NAV_ROTATE_CW on first tick", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(navCmdIds(comms.sent)).toContain(DroneCmd.NAV_ROTATE_CW);

    act(() => {
      tr!.unmount();
    });
  });

  it("ROTATE -> FORWARD transition emits NAV_FORWARD", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const beforeUpdate = comms.sent.length;

    act(() => {
      tr.update(<Probe snapshot={FORWARD_ALIGNED()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    const navAfter = navCmdIds(comms.sent.slice(beforeUpdate));
    expect(navAfter).toContain(DroneCmd.NAV_FORWARD);
    expect(captured.latest!.state).toBe("FORWARD");

    act(() => {
      tr.unmount();
    });
  });

  it("repeated ticks re-send NAV + full motor quartet when output is unchanged", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const sentAfterFirstTick = comms.sent.length;

    /* period = 100ms @ 10Hz → 300ms crosses three more firings → 12 motor + 3 NAV echoes */
    act(() => {
      jest.advanceTimersByTime(300);
    });
    const sliceAfter = comms.sent.slice(sentAfterFirstTick);
    const motorWritesAfter = sliceAfter.filter((b) => isMotorCmd(b[1])).length;
    expect(motorWritesAfter).toBe(12);
    const navRepeatsAfter = sliceAfter.filter((b) => b[1] === DroneCmd.NAV_ROTATE_CW).length;
    expect(navRepeatsAfter).toBe(3);

    act(() => {
      tr!.unmount();
    });
  });

  it("snapshot change ROTATE→FORWARD still sends full quartet (not diff-only motors)", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110); //first tick: ROTATE -> M1=40, M4=40
    });
    const beforeUpdate = comms.sent.length;

    // Switch to a snapshot that should transition into FORWARD.
    // From ROTATE state with yaw=0, distance=10 -> FORWARD -> M1=40, M3=40, M2=0, M4=0.
    act(() => {
      tr.update(<Probe snapshot={FORWARD_ALIGNED()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    const sliceTick2 = comms.sent.slice(beforeUpdate);
    expect(navCmdIds(sliceTick2)).toContain(DroneCmd.NAV_FORWARD);
    const forwardMotors = sliceTick2.filter((b) => isMotorCmd(b[1])).map(decodeMotorPacket);
    expect(forwardMotors.length).toBe(4);
    const byIdx = new Map(forwardMotors.map((w) => [w.idx, w.throttle] as const));
    expect(byIdx.get(0)).toBe(40);
    expect(byIdx.get(1)).toBe(0);
    expect(byIdx.get(2)).toBe(40);
    expect(byIdx.get(3)).toBe(0);
    expect(captured.latest!.state).toBe("FORWARD");

    act(() => {
      tr.unmount();
    });
  });

  it("FORWARD -> RETREAT transition emits NAV_BACKWARD when too close", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={FORWARD_ALIGNED()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110); // FORWARD
    });

    act(() => {
      tr.update(<Probe snapshot={TOO_CLOSE()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(captured.latest!.state).toBe("RETREAT");
    expect(navCmdIds(comms.sent)).toContain(DroneCmd.NAV_BACKWARD);

    act(() => {
      tr.unmount();
    });
  });

  it("stop() emits NAV_IDLE when stopping from an active phase", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const beforeStop = comms.sent.length;

    act(() => {
      captured.latest!.stop();
    });

    const stopNav = navCmdIds(comms.sent.slice(beforeStop));
    expect(stopNav).toContain(DroneCmd.NAV_IDLE);

    act(() => {
      tr!.unmount();
    });
  });

  it("stop() force-writes zero to every motor regardless of prev state", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const beforeStop = comms.sent.length;

    act(() => {
      captured.latest!.stop();
    });

    const stopWrites = comms.sent.slice(beforeStop).filter((b) => isMotorCmd(b[1])).map(decodeMotorPacket);
    expect(stopWrites.length).toBe(4); //one zero per motor, forced
    for (const w of stopWrites) {
      expect(w.throttle).toBe(0);
    }
    const idsSent = stopWrites.map((w) => w.idx).sort();
    expect(idsSent).toEqual([0, 1, 2, 3]);
    expect(captured.latest!.running).toBe(false);
    expect(captured.latest!.state).toBe("IDLE");

    act(() => {
      tr!.unmount();
    });
  });

  it("snapshot intent becoming unhealthy mid-run zeros previously spinning motors within one tick", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110); //M1+M4 spinning
    });
    const beforeUnhealthy = comms.sent.length;

    // Now flip to AWAITING_DRONE_FIX. Evaluator returns IDLE + zeros.
    act(() => {
      tr.update(<Probe snapshot={AWAITING()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    const newWrites = comms.sent.slice(beforeUnhealthy).filter((b) => isMotorCmd(b[1])).map(decodeMotorPacket);
    const writesByIdx = new Map<number, number>();
    for (const w of newWrites) writesByIdx.set(w.idx, w.throttle);
    expect(writesByIdx.get(0)).toBe(0);
    expect(writesByIdx.get(1)).toBe(0);
    expect(writesByIdx.get(2)).toBe(0);
    expect(writesByIdx.get(3)).toBe(0);
    expect(captured.latest!.state).toBe("IDLE");

    act(() => {
      tr!.unmount();
    });
  });

  it("watchdog: stale snapshot triggers IDLE + zero writes and surfaces in reason", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(
        <Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} staleSnapshotMs={1500} />
      );
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    expect(captured.latest!.state).toBe("ROTATE");

    // Advance MOCK_NOW so the existing snapshot becomes stale (snapshot generatedAtMs is fixed).
    MOCK_NOW += 5000;
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(captured.latest!.state).toBe("IDLE");
    expect(captured.latest!.reason).toMatch(/stale/i);

    act(() => {
      tr!.unmount();
    });
  });

  it("unmount clears interval and force-writes zeros", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const beforeUnmount = comms.sent.length;

    act(() => {
      tr!.unmount();
    });

    const sliceAfterUnmount = comms.sent.slice(beforeUnmount);
    const unmountWrites = sliceAfterUnmount.filter((b) => isMotorCmd(b[1])).map(decodeMotorPacket);
    expect(unmountWrites.length).toBe(4); //forced zero per motor
    for (const w of unmountWrites) expect(w.throttle).toBe(0);
    expect(navCmdIds(sliceAfterUnmount)).toContain(DroneCmd.NAV_IDLE);
    expect(sliceAfterUnmount.some((b) => b[1] === DroneCmd.FOLLOW_TOGGLE)).toBe(true);

    // No ticks should fire after unmount (only FOLLOW + NAV teardown + zeros).
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(comms.sent.length).toBe(beforeUnmount + 6); // FOLLOW_TOGGLE, NAV_IDLE, 4× motor zero
  });

  it("start() while already running is a no-op", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });
    const sentAfterOne = comms.sent.length;

    act(() => {
      captured.latest!.start(); // duplicate: must not attach a second interval
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(comms.sent.length).toBe(sentAfterOne);

    act(() => {
      jest.advanceTimersByTime(120); // crosses next scheduled tick (~100 ms period)
    });

    expect(comms.sent.length - sentAfterOne).toBeGreaterThanOrEqual(5); // NAV + 4 motors

    act(() => {
      tr!.unmount();
    });
  });

  it("start() emits FOLLOW_TOGGLE on the BLE follow path (typed packet bytes)", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });

    expect(comms.sent.some((b) => b[1] === DroneCmd.FOLLOW_TOGGLE)).toBe(true);

    act(() => {
      tr!.unmount();
    });
  });

  it("uses sendBytesBleOnly when exposed (HybridComms) and skips sendBytes for payloads", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const ble = jest.fn(async (_b: Uint8Array) => {});
    const bytes = jest.fn(async (_b: Uint8Array) => {});
    const comms: FollowMockCommsLike = {
      sendBytesBleOnly: ble,
      sendBytes: bytes,
    };

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    expect(ble).toHaveBeenCalled();
    expect(bytes).not.toHaveBeenCalled();
    act(() => {
      tr!.unmount();
    });
  });

  it("never sends ARM, DISARM, ESTOP, or HEARTBEAT (SET_MOTOR, NAV intents, FOLLOW_TOGGLE only)", () => {
    const captured: Captured = { latest: null };
    const Probe = makeProbe(captured);
    const comms = mockComms();

    let tr: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(<Probe snapshot={ROTATE_RIGHT()} comms={comms} tickHz={10} />);
    });
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => {
      captured.latest!.stop();
    });

    const cmds = comms.sent.map((b) => b[1]);
    for (const c of cmds) {
      const allowed =
        c === DroneCmd.SET_MOTOR_1 ||
        c === DroneCmd.SET_MOTOR_2 ||
        c === DroneCmd.SET_MOTOR_3 ||
        c === DroneCmd.SET_MOTOR_4 ||
        c === DroneCmd.NAV_ROTATE_CW ||
        c === DroneCmd.NAV_ROTATE_CCW ||
        c === DroneCmd.NAV_FORWARD ||
        c === DroneCmd.NAV_HOLD ||
        c === DroneCmd.NAV_IDLE ||
        c === DroneCmd.NAV_BACKWARD ||
        c === DroneCmd.FOLLOW_TOGGLE;
      expect(allowed).toBe(true);
    }

    act(() => {
      tr!.unmount();
    });
  });
});
