import React, { createContext, useContext, useEffect, useMemo } from "react";
import { createHybridComms, USE_HYBRID_DUAL_LINK } from "../comms/hybrid-comms";
import { createWifiComms } from "../comms/wifi-comms";
import type { DroneComms } from "../comms/comms";

const CommsContext = createContext<DroneComms | null>(null);

/**
 * Provides the active drone comms link (WSS + optional HTTPS /gps poll).
 * When `USE_HYBRID_DUAL_LINK` is true, wraps Wi‑Fi comms with BLE merge + BLE-first commands.
 * Does not connect on its own: call `comms.connect()` after joining the
 * drone Wi‑Fi from the Connect tab, or use Home → Connect for manual start.
 */
export function CommsProvider({ children }: { children: React.ReactNode }) {
  const wifi = useMemo(() => createWifiComms(), []);
  const comms = useMemo(
    () => (USE_HYBRID_DUAL_LINK ? createHybridComms(wifi) : wifi),
    [wifi]
  );

  useEffect(() => {
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
