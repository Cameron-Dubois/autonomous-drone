import React, { createContext, useContext, useMemo } from "react";
import { createBleComms } from "../comms/ble-comms";
import type { DroneComms } from "../comms/comms";

const CommsContext = createContext<DroneComms | null>(null);

export function CommsProvider({ children }: { children: React.ReactNode }) {
  const comms = useMemo(() => createBleComms(), []);
  return <CommsContext.Provider value={comms}>{children}</CommsContext.Provider>;
}

export function useComms(): DroneComms {
  const ctx = useContext(CommsContext);
  if (!ctx) throw new Error("useComms must be used within CommsProvider");
  return ctx;
}
