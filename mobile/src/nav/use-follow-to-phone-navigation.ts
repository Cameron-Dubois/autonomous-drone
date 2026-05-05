//hook: phone source + optional drone provider drive the pure navigator

import { useEffect, useMemo, useRef, useState } from "react";

import { NullDroneProvider, type DronePositionProvider } from "./drone-position-provider";
import { createFollowToPhoneNavigator } from "./navigator";
import { createPhoneFixSource, type PhoneFixSource } from "./phone-fix-source";
import type { DroneFix, NavigationConfig, NavigationSnapshot, PhoneFix } from "./types";

const INITIAL_SNAPSHOT: NavigationSnapshot = {
  intent: "AWAITING_PHONE_FIX",
  distancePhoneToDrone_m: null,
  bearingDroneToPhone_deg: null,
  phoneFix: null,
  droneFix: null,
  withinArrival: false,
  generatedAtMs: 0,
};

export type UseFollowToPhoneNavigationOptions = {
  config?: NavigationConfig;
  //defaults to NullDroneProvider
  droneProvider?: DronePositionProvider;
  //defaults to createPhoneFixSource
  phoneSource?: PhoneFixSource;
};

export function useFollowToPhoneNavigation(
  options: UseFollowToPhoneNavigationOptions = {}
): NavigationSnapshot {
  const navigator = useMemo(() => createFollowToPhoneNavigator(options.config), [options.config]);

  const phoneSourceRef = useRef<PhoneFixSource | null>(null);
  if (phoneSourceRef.current == null) {
    phoneSourceRef.current = options.phoneSource ?? createPhoneFixSource();
  }

  const droneProviderRef = useRef<DronePositionProvider | null>(null);
  if (droneProviderRef.current == null) {
    droneProviderRef.current = options.droneProvider ?? new NullDroneProvider();
  }

  const phoneRef = useRef<PhoneFix | null>(null);
  const droneRef = useRef<DroneFix | null>(null);
  const [snapshot, setSnapshot] = useState<NavigationSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;
    const recompute = () => {
      if (cancelled) return;
      setSnapshot(navigator.evaluate({ phoneFix: phoneRef.current, droneFix: droneRef.current }));
    };

    const phoneSource = phoneSourceRef.current!;
    const droneProvider = droneProviderRef.current!;

    const unsubPhone = phoneSource.subscribe((fix) => {
      phoneRef.current = fix;
      recompute();
    });
    const unsubDrone = droneProvider.subscribe((fix) => {
      droneRef.current = fix;
      recompute();
    });

    phoneSource.start().catch(() => {
      //leave snapshot at AWAITING_PHONE_FIX if perm fails
    });

    return () => {
      cancelled = true;
      unsubPhone();
      unsubDrone();
      phoneSource.stop();
    };
  }, [navigator]);

  return snapshot;
}
