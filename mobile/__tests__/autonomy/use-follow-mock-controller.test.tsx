import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { DroneCmd } from "../../src/prototype/types";
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
  };
}

function isMotorCmd(cmdId: number): boolean {
  return cmdId >= DroneCmd.SET_MOTOR_1 && cmdId <= DroneCmd.SET_MOTOR_4;
}

function opcodeSequence(bytes: Uint8Array[]): number[] {
  return bytes.map((b) => b[1]);
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

  it("start() emits no BLE frames until first tick (phase-only NAV mapping)", () => {
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
    expect(comms.sent.length).toBe(0);
    act(() => {
      tr!.unmount();
    });
  });

  it("first tick from ROTATE chip sends NAV_ROTATE_CW only (no motors)", () => {
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

    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW]);
    expect(comms.sent.every((b) => !isMotorCmd(b[1]))).toBe(true);
    expect(captured.latest!.state).toBe("ROTATE");

    act(() => {
      tr!.unmount();
    });
  });

  it("stable ROTATE does not spam BLE across extra ticks", () => {
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

    expect(comms.sent.length).toBe(1);

    act(() => {
      jest.advanceTimersByTime(350);
    });
    expect(comms.sent.length).toBe(1);

    act(() => {
      tr!.unmount();
    });
  });

  it("ROTATE -> FORWARD chip transition emits NAV_FORWARD", () => {
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

    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW]);

    act(() => {
      tr.update(<Probe snapshot={FORWARD_ALIGNED()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW, DroneCmd.NAV_FORWARD]);
    expect(captured.latest!.state).toBe("FORWARD");

    act(() => {
      tr.unmount();
    });
  });

  it("FORWARD -> RETREAT chip sends NAV_BACKWARD", () => {
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
      jest.advanceTimersByTime(110);
    });

    act(() => {
      tr.update(<Probe snapshot={TOO_CLOSE()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(captured.latest!.state).toBe("RETREAT");
    expect(opcodeSequence(comms.sent)).toContain(DroneCmd.NAV_BACKWARD);
    expect(comms.sent.every((b) => !isMotorCmd(b[1]))).toBe(true);

    act(() => {
      tr.unmount();
    });
  });

  it("stop() from active phase emits NAV_IDLE (no SET_MOTOR)", () => {
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

    act(() => {
      captured.latest!.stop();
    });

    expect(opcodeSequence(comms.sent)).toContain(DroneCmd.NAV_IDLE);
    expect(comms.sent.some((b) => isMotorCmd(b[1]))).toBe(false);
    expect(captured.latest!.running).toBe(false);
    expect(captured.latest!.state).toBe("IDLE");

    act(() => {
      tr!.unmount();
    });
  });

  it("intent unhealthy -> IDLE chip sends NAV_IDLE when leaving ROTATE", () => {
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
    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW]);

    act(() => {
      tr.update(<Probe snapshot={AWAITING()} comms={comms} tickHz={10} />);
    });
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(captured.latest!.state).toBe("IDLE");
    expect(opcodeSequence(comms.sent)).toContain(DroneCmd.NAV_IDLE);
    expect(comms.sent.some((b) => isMotorCmd(b[1]))).toBe(false);

    act(() => {
      tr!.unmount();
    });
  });

  it("watchdog: stale snapshot moves chip IDLE and emits NAV_IDLE when exiting ROTATE", () => {
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
    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW]);
    expect(captured.latest!.state).toBe("ROTATE");

    MOCK_NOW += 5000;
    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(captured.latest!.state).toBe("IDLE");
    expect(captured.latest!.reason).toMatch(/stale/i);
    expect(opcodeSequence(comms.sent)).toContain(DroneCmd.NAV_IDLE);

    act(() => {
      tr!.unmount();
    });
  });

  it("unmount during active Follow sends teardown NAV_IDLE (no FOLLOW_TOGGLE)", () => {
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
    expect(opcodeSequence(comms.sent)).toEqual([DroneCmd.NAV_ROTATE_CW]);

    act(() => {
      tr!.unmount();
    });

    expect(opcodeSequence(comms.sent)).toEqual([
      DroneCmd.NAV_ROTATE_CW,
      DroneCmd.NAV_IDLE,
    ]);
    expect(comms.sent.some((b) => isMotorCmd(b[1]))).toBe(false);
    expect(comms.sent.some((b) => b[1] === DroneCmd.FOLLOW_TOGGLE)).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(comms.sent.length).toBe(2);
  });

  it("duplicate start() does not accelerate BLE traffic", () => {
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

    expect(comms.sent.length).toBe(1);
    act(() => {
      captured.latest!.start();
    });
    act(() => {
      jest.advanceTimersByTime(220);
    });
    expect(comms.sent.length).toBe(1);

    act(() => {
      tr!.unmount();
    });
  });

  it("uses sendBytesBleOnly when exposed (HybridComms) and skips sendBytes", () => {
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
    expect(ble).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(110);
    });
    expect(ble).toHaveBeenCalledTimes(1);
    expect(bytes).not.toHaveBeenCalled();
    act(() => {
      tr!.unmount();
    });
  });

  it("never sends ARM, MOTOR writes, FOLLOW_TOGGLE, or HEARTBEAT — NAV phase only", () => {
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
      jest.advanceTimersByTime(220);
    });
    act(() => {
      captured.latest!.stop();
    });

    const cmds = comms.sent.map((b) => b[1]);
    for (const c of cmds) {
      const allowed =
        c === DroneCmd.NAV_ROTATE_CW ||
        c === DroneCmd.NAV_ROTATE_CCW ||
        c === DroneCmd.NAV_FORWARD ||
        c === DroneCmd.NAV_HOLD ||
        c === DroneCmd.NAV_IDLE ||
        c === DroneCmd.NAV_BACKWARD;
      expect(allowed).toBe(true);
    }

    act(() => {
      tr!.unmount();
    });
  });
});
