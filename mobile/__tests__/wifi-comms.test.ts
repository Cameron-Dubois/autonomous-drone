import { createWifiComms } from "../src/comms/wifi-comms";
import { buildRawCommandBytes, DroneCmd } from "../src/protocol/types";

type Listener = (...args: any[]) => void;

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0;
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  onclose: Listener | null = null;
  sent: ArrayBuffer[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  // Test helpers
  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }
  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
  emitClose(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const realWebSocket = (globalThis as any).WebSocket;
beforeEach(() => {
  jest.useFakeTimers();
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
});
afterEach(() => {
  jest.useRealTimers();
  (globalThis as any).WebSocket = realWebSocket;
});

describe("createWifiComms", () => {
  it("opens a WebSocket on connect, becomes SECURE_LINK on open, parses telemetry text frames", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    const seen: string[] = [];
    comms.subscribeTelemetry((t) => seen.push(t.link));

    await comms.connect();
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe("ws://test/ws");
    expect(seen).toEqual(["DISCONNECTED", "CONNECTING"]);

    ws.emitOpen();
    expect(seen[seen.length - 1]).toBe("SECURE_LINK");

    const samples: any[] = [];
    comms.subscribeTelemetry((t) => samples.push(t));
    samples.length = 0;
    ws.emitMessage('{"droneLat":1.5,"droneLon":-2.5,"droneGpsValid":true}');
    const last = samples[samples.length - 1];
    expect(last.droneLat).toBe(1.5);
    expect(last.droneLon).toBe(-2.5);
    expect(last.droneGpsValid).toBe(true);
  });

  it("splits multi-line text frames and parses each line independently", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    const seen: any[] = [];
    comms.subscribeTelemetry((t) => seen.push(t));

    await comms.connect();
    MockWebSocket.instances[0].emitOpen();

    seen.length = 0;
    MockWebSocket.instances[0].emitMessage(
      'TEL dlat=10 dlon=20 gps=1\nTEL heading=90\n'
    );
    const last = seen[seen.length - 1];
    expect(last.droneLat).toBe(10);
    expect(last.droneLon).toBe(20);
    expect(last.droneGpsValid).toBe(true);
    expect(last.droneHeadingDeg).toBe(90);
  });

  it("sendBytes writes a binary frame containing the command packet", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    await comms.connect();
    const ws = MockWebSocket.instances[0];
    ws.emitOpen();

    const packet = buildRawCommandBytes(DroneCmd.ARM);
    await comms.sendBytes(packet);

    expect(ws.sent.length).toBe(1);
    const sent = new Uint8Array(ws.sent[0]);
    expect(sent.length).toBe(packet.length);
    for (let i = 0; i < packet.length; i++) {
      expect(sent[i]).toBe(packet[i]);
    }
  });

  it("send(cmd) routes through sendBytes", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    await comms.connect();
    const ws = MockWebSocket.instances[0];
    ws.emitOpen();

    await comms.send({ type: "ARM" });
    expect(ws.sent.length).toBe(1);
    const sent = new Uint8Array(ws.sent[0]);
    // Format: [seq, cmd_id, payload_len]
    expect(sent[1]).toBe(DroneCmd.ARM);
    expect(sent[2]).toBe(0);
  });

  it("drops sendBytes silently when not OPEN", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    await comms.connect();
    const ws = MockWebSocket.instances[0];
    // do not emit open
    await comms.sendBytes(new Uint8Array([1, 2, 3]));
    expect(ws.sent.length).toBe(0);
  });

  it("schedules reconnect after unintentional close", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    await comms.connect();
    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[0].emitClose();
    expect(MockWebSocket.instances.length).toBe(1);
    jest.advanceTimersByTime(600);
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("disconnect() suppresses reconnect", async () => {
    const comms = createWifiComms({ url: "ws://test/ws" });
    await comms.connect();
    MockWebSocket.instances[0].emitOpen();
    await comms.disconnect();
    jest.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances.length).toBe(1);
  });
});
