// initial_mobile_code/src/comms/ble/ble.real.ts

import type {
  BleDeviceSummary,
  BleScanOptions,
  BleTelemetryCallback,
  DroneBleClient,
} from "./types.ts";

// ESP32 NimBLE example UUIDs from your drone_ble firmware:
const SERVICE_UUID = "592f1295-4399-9999-12c8-58b459a2712d";
const CHARACTERISTIC_UUID = "33333333-2222-2222-1111-111100000000";

// NOTE: We import the native lib only inside this file.
// This file must NOT be imported in Expo Go.
import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";

export class RealDroneBleClient implements DroneBleClient {
  private manager = new BleManager();
  private connected: Device | null = null;
  private telemetryUnsub: (() => void) | null = null;

  async scan(options?: BleScanOptions): Promise<BleDeviceSummary[]> {
    const timeoutMs = options?.timeoutMs ?? 5000;
    const found = new Map<string, BleDeviceSummary>();

    return new Promise((resolve, reject) => {
      const stop = () => {
        try {
          this.manager.stopDeviceScan();
        } catch {}
      };

      const timer = setTimeout(() => {
        stop();
        resolve(Array.from(found.values()));
      }, timeoutMs);

      this.manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
        if (error) {
          clearTimeout(timer);
          stop();
          reject(error);
          return;
        }
        if (!device) return;

        const name = device.name ?? device.localName ?? "Unknown";
        found.set(device.id, { id: device.id, name, rssi: device.rssi ?? undefined });
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    // Clean up any previous connection
    await this.disconnect();

    const device = await this.manager.connectToDevice(deviceId, { autoConnect: true });
    this.connected = device;

    await device.discoverAllServicesAndCharacteristics();
  }

  async disconnect(): Promise<void> {
    if (this.telemetryUnsub) {
      this.telemetryUnsub();
      this.telemetryUnsub = null;
    }

    if (this.connected) {
      try {
        await this.connected.cancelConnection();
      } catch {}
      this.connected = null;
    }
  }

  getConnectedDeviceId(): string | null {
    return this.connected?.id ?? null;
  }

  async sendCommand(message: string): Promise<void> {
    if (!this.connected) throw new Error("BLE: not connected");

    const base64 = Buffer.from(message, "utf8").toString("base64");
    await this.connected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      base64
    );
  }

  subscribeTelemetry(cb: BleTelemetryCallback): () => void {
    if (!this.connected) throw new Error("BLE: not connected");

    const sub = this.connected.monitorCharacteristicForService(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) return;
        if (!characteristic?.value) return;

        const decoded = Buffer.from(characteristic.value, "base64").toString("utf8");
        cb(decoded);
      }
    );

    const unsub = () => sub.remove();
    this.telemetryUnsub = unsub;
    return unsub;
  }
}