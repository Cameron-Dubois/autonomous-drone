import React, { createContext, useContext, useEffect, useMemo } from "react";
import { createWifiComms } from "../comms/wifi-comms";
import type { DroneComms } from "../comms/comms";

const CommsContext = createContext<DroneComms | null>(null);

/**
 * Provides the active drone comms link. Today this is WiFi-only: a WebSocket
 * to the drone over its access point is opened on mount and kept alive with
 * exponential backoff. BLE remains available in the Connect tab for pairing
 * but does not feed telemetry or commands through this context.
 */
export function CommsProvider({ children }: { children: React.ReactNode }) {
  const comms = useMemo(() => createWifiComms(), []);

  useEffect(() => {
    void comms.connect();
    return () => {
      void comms.disconnect();
    };
  }, [comms]);

  return <CommsContext.Provider value={comms}>{children}</CommsContext.Provider>;
}

export function useComms(): DroneComms {
  const ctx = useContext(CommsContext);
  if (!ctx) throw new Error("useComms must be used within CommsProvider");
  return ctx;
}
