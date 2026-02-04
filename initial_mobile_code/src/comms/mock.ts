import type { DroneComms } from "./comms";
import type { Command, Telemetry } from "../protocol/types";

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function createMockComms(): DroneComms {
  let t: Telemetry = {
    link: "DISCONNECTED",
    batteryPct: 84,
    batteryMins: 24,
    speedKmh: 42,
    altM: 128,
    rssiBars: 3,
    followMode: true,
  };

  const listeners = new Set<(x: Telemetry) => void>();
  let simTimer: ReturnType<typeof setInterval> | null = null;

  const emit = () => {
    for (const cb of listeners) cb({ ...t });
  };

  const startSim = () => {
    if (simTimer) return;
    simTimer = setInterval(() => {
      if (t.link !== "SECURE_LINK") return;

      t.speedKmh = clampInt(t.speedKmh + (Math.random() > 0.5 ? 1 : -1), 0, 80);
      t.altM = clampInt(t.altM + (Math.random() > 0.5 ? 1 : -1), 0, 500);

      if (Math.random() < 0.05) t.batteryPct = clampInt(t.batteryPct - 1, 0, 100);
      t.batteryMins = clampInt(Math.round((t.batteryPct / 100) * 30), 0, 30);

      if (Math.random() < 0.2) {
        const delta = Math.random() > 0.5 ? 1 : -1;
        t.rssiBars = clampInt(t.rssiBars + delta, 0, 4) as Telemetry["rssiBars"];
      }

      emit();
    }, 2000);
  };

  const stopSim = () => {
    if (simTimer) clearInterval(simTimer);
    simTimer = null;
  };

  return {
    async connect() {
      t.link = "CONNECTING";
      emit();
      await new Promise((r) => setTimeout(r, 500));
      t.link = "SECURE_LINK";
      emit();
      startSim();
    },

    async disconnect() {
      t.link = "DISCONNECTED";
      emit();
      stopSim();
    },

    async send(cmd: Command) {
      console.log("📡 CMD:", cmd);

      if (t.link !== "SECURE_LINK") return;

      switch (cmd.type) {
        case "FOLLOW_TOGGLE":
          t.followMode = !t.followMode;
          break;
        case "ASCEND":
          t.altM = clampInt(t.altM + 1, 0, 500);
          break;
        case "DESCEND":
          t.altM = clampInt(t.altM - 1, 0, 500);
          break;
        case "ESTOP":
          t.speedKmh = 0;
          t.followMode = false;
          break;
      }
      emit();
    },

    subscribeTelemetry(cb) {
      listeners.add(cb);
      cb({ ...t });
      return () => listeners.delete(cb);
    },
  };
}
