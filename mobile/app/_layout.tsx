import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initRealBleClient } from "../src/comms/BLE";
import { CommsProvider } from "../src/context/CommsContext";

export default function RootLayout() {
  const [bleReady, setBleReady] = useState(false);

  useEffect(() => {
    initRealBleClient()
      .then(() => setBleReady(true))
      .catch(() => setBleReady(true)); // Still render on failure (e.g. Expo Go)
  }, []);

  if (!bleReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#05070a" }}>
          <ActivityIndicator size="large" color="#00f2ff" />
          <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 16 }}>Initializing BLE...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

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
