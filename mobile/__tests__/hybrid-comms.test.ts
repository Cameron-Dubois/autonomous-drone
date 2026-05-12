import type { DroneComms } from "../src/comms/comms";
import type { DroneBleClient } from "../src/comms/BLE/types";
import * as BLE from "../src/comms/BLE";
import { createHybridComms, isHybridComms, stripLinkFromPatch } from "../src/comms/hybrid-comms";
import { createDefaultTelemetry, type Telemetry } from "../src/protocol/types";

describe("stripLinkFromPatch", () => {
  it("drops link while keeping other fields", () => {
    const p: Partial<Telemetry> = { link: "SECURE_LINK", droneGpsValid: true, batteryPct: 42 };
    expect(stripLinkFromPatch(p)).toEqual({ droneGpsValid: true, batteryPct: 42 });
  });
});

describe("createHybridComms", () => {
  const getBleSpy = jest.spyOn(BLE, "getBleClient");

  afterEach(() => {
    getBleSpy.mockReset();
  });

  it("exposes hybrid sync API", () => {
    const inner: DroneComms = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
      sendBytes: jest.fn(),
      subscribeTelemetry: (cb) => {
        cb(createDefaultTelemetry());
        return jest.fn();
      },
    };
    getBleSpy.mockImplementation(
      () =>
        ({
          getConnectedDeviceId: () => null,
          subscribeTelemetry: () => () => {},
          sendCommand: jest.fn(),
        }) as unknown as DroneBleClient
    );
    const h = createHybridComms(inner);
    expect(isHybridComms(h)).toBe(true);
    expect(() => h.syncBleFromExternalConnection()).not.toThrow();
  });

  it("routes sendBytes to BLE when connected", async () => {
    const bleCmd = jest.fn().mockResolvedValue(undefined);
    getBleSpy.mockImplementation(
      () =>
        ({
          getConnectedDeviceId: () => "dev-1",
          subscribeTelemetry: () => () => {},
          sendCommand: bleCmd,
        }) as unknown as DroneBleClient
    );

    const inner: DroneComms = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
      sendBytes: jest.fn(),
      subscribeTelemetry: (cb) => {
        cb(createDefaultTelemetry());
        return jest.fn();
      },
    };

    const h = createHybridComms(inner);
    await h.sendBytes(new Uint8Array([9, 8, 7]));
    expect(bleCmd).toHaveBeenCalledTimes(1);
    expect(inner.sendBytes).not.toHaveBeenCalled();
  });

  it("forwards sendBytes to inner when BLE not connected", async () => {
    getBleSpy.mockImplementation(
      () =>
        ({
          getConnectedDeviceId: () => null,
          subscribeTelemetry: () => () => {},
          sendCommand: jest.fn(),
        }) as unknown as DroneBleClient
    );

    const innerSend = jest.fn().mockResolvedValue(undefined);
    const inner: DroneComms = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
      sendBytes: innerSend,
      subscribeTelemetry: (cb) => {
        cb(createDefaultTelemetry());
        return jest.fn();
      },
    };

    const h = createHybridComms(inner);
    await h.sendBytes(new Uint8Array([1, 2]));
    expect(innerSend).toHaveBeenCalledTimes(1);
  });
});
