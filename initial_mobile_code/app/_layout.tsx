import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initRealBleClient } from "../src/comms/BLE";
import { CommsProvider } from "../src/context/CommsContext";

// Use real BLE in dev/production builds when EXPO_PUBLIC_BLE_MOCK=0
const useRealBle =
  (typeof globalThis !== "undefined" &&
    (globalThis as any).process?.env?.EXPO_PUBLIC_BLE_MOCK?.toString().toLowerCase() === "0") ||
  (typeof globalThis !== "undefined" &&
    (globalThis as any).process?.env?.EXPO_PUBLIC_BLE_MOCK?.toString().toLowerCase() === "false");

export default function RootLayout() {
  useEffect(() => {
    if (useRealBle) {
      initRealBleClient().catch(() => {
        // In Expo Go this will fail (native module not available); ignore.
      });
    }
  }, []);

  return (
    <SafeAreaProvider>
      <CommsProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </CommsProvider>
    </SafeAreaProvider>
  );
}
