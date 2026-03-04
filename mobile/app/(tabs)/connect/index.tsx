import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, useWindowDimensions, Platform } from "react-native";
import * as Location from "expo-location";
import { getBleClient, setStoredDeviceId, type BleDeviceSummary } from "../../../src/comms/BLE";
import { getWifiClient, type WifiNetworkSummary } from "../../../src/comms/WiFi";
import { useComms } from "../../../src/context/CommsContext";

const SCAN_TIMEOUT_MS = 5000;
const WIFI_SCAN_TIMEOUT_MS = 2500;

function formatRssi(rssi?: number): string {
  if (rssi == null) return "—";
  if (rssi >= -50) return "Strong";
  if (rssi >= -70) return "Good";
  return "Weak";
}

function formatWifiSignal(strength?: number): string {
  if (strength == null) return "—";
  if (strength >= 80) return "Excellent";
  if (strength >= 60) return "Good";
  return "Weak";
}

export default function Connect() {
  const comms = useComms();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const panelWidth = Math.min(390, SCREEN_WIDTH - 32);
  const [bluetoothStatus, setBluetoothStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
  const [devices, setDevices] = useState<BleDeviceSummary[]>([]);
  const [bleError, setBleError] = useState<string | null>(null);
  const [wifiStatus, setWifiStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkSummary[]>([]);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [wifiRefresh, setWifiRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = getWifiClient();
        if (typeof client.refreshConnectionStatus === "function") {
          await client.refreshConnectionStatus();
          if (!cancelled) setWifiRefresh((n) => n + 1);
        }
      } catch {
        // WiFi may not be available (Expo Go)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleScan = useCallback(async () => {
    setBleError(null);
    setBluetoothStatus("scanning");
    try {
      const client = getBleClient();
      const list = await client.scan({ timeoutMs: SCAN_TIMEOUT_MS });
      setDevices(list);
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBluetoothStatus("disconnected");
    }
  }, []);

  const handleConnect = useCallback(async (deviceId: string) => {
    setBleError(null);
    try {
      const client = getBleClient();
      await client.connect(deviceId);
      setStoredDeviceId(deviceId);
      setBluetoothStatus("connected");
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Connection failed");
      Alert.alert("Connection failed", e instanceof Error ? e.message : "Could not connect to device.");
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setBleError(null);
    try {
      await comms.disconnect();
      setBluetoothStatus("disconnected");
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Disconnect failed");
    }
  }, [comms]);

  const handleWifiScan = useCallback(async () => {
    setWifiError(null);
    setWifiStatus("scanning");
    try {
      if (Platform.OS === "android") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setWifiError("Location permission required for WiFi scan.");
          return;
        }
      }
      const client = getWifiClient();
      const list = await client.scan({ timeoutMs: WIFI_SCAN_TIMEOUT_MS });
      setWifiNetworks(list);
      if (typeof client.refreshConnectionStatus === "function") {
        await client.refreshConnectionStatus();
        setWifiRefresh((n) => n + 1);
      }
    } catch (e) {
      setWifiError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setWifiStatus("disconnected");
    }
  }, []);

  const handleWifiConnect = useCallback(async (network: WifiNetworkSummary) => {
    setWifiError(null);
    const connectWithPassword = async (password?: string) => {
      try {
        const client = getWifiClient();
        await client.connect(network.id, password);
        if (typeof client.refreshConnectionStatus === "function") {
          await client.refreshConnectionStatus();
          setWifiRefresh((n) => n + 1);
        }
      } catch (e) {
        setWifiError(e instanceof Error ? e.message : "Connection failed");
        Alert.alert("Connection failed", e instanceof Error ? e.message : "Could not connect to network.");
      }
    };
    if (network.secured) {
      if (Platform.OS === "ios") {
        Alert.prompt(
          `Connect to ${network.ssid}`,
          "Enter WiFi password",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Connect", onPress: (pw?: string) => connectWithPassword(pw || undefined) },
          ],
          "secure-text"
        );
      } else {
        Alert.alert(
          "Secured network",
          `To connect to "${network.ssid}", go to your device WiFi settings and enter the password there.`
        );
      }
    } else {
      await connectWithPassword();
    }
  }, []);

  const handleWifiDisconnect = useCallback(async () => {
    setWifiError(null);
    try {
      const client = getWifiClient();
      await client.disconnect();
      if (typeof client.refreshConnectionStatus === "function") {
        await client.refreshConnectionStatus();
        setWifiRefresh((n) => n + 1);
      }
    } catch (e) {
      setWifiError(e instanceof Error ? e.message : "Disconnect failed");
      Alert.alert("Disconnect failed", e instanceof Error ? e.message : "Could not disconnect.");
    }
  }, []);

  const connectedId = (() => {
    try {
      return getBleClient().getConnectedDeviceId();
    } catch {
      return null;
    }
  })();
  const isConnected = connectedId != null;

  const connectedWifiId = (() => {
    try {
      void wifiRefresh; // force recalc when refresh changes
      return getWifiClient().getConnectedNetworkId();
    } catch {
      return null;
    }
  })();
  const isWifiConnected = connectedWifiId != null;

  return (
    <View style={styles.root}>
      <View style={[styles.panel, { width: panelWidth, maxHeight: SCREEN_HEIGHT - 32 }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Connection</Text>
            <Text style={styles.subtitle}>Connect to drone via Bluetooth or WiFi</Text>
          </View>

          {/* Bluetooth Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Bluetooth</Text>
              <View style={[styles.statusBadge, isConnected && styles.statusConnected]}>
                <Text style={styles.statusText}>
                  {isConnected ? "CONNECTED" : bluetoothStatus === "scanning" ? "SCANNING" : "DISCONNECTED"}
                </Text>
              </View>
            </View>

            {bleError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{bleError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => {
                if (isConnected) {
                  handleDisconnect();
                } else if (bluetoothStatus === "scanning") {
                  // Scan in progress; button shows "Scanning..."
                } else {
                  handleScan();
                }
              }}
              disabled={bluetoothStatus === "scanning"}
            >
              {bluetoothStatus === "scanning" ? (
                <ActivityIndicator color="rgba(255,255,255,0.7)" />
              ) : (
                <Text style={styles.btnLabel}>
                  {isConnected ? "Disconnect" : "Scan for Devices"}
                </Text>
              )}
            </Pressable>

            <View style={styles.deviceList}>
              <Text style={styles.label}>Available Devices</Text>
              {devices.length === 0 && !bluetoothStatus && (
                <Text style={styles.hint}>Tap “Scan for Devices” to find your drone.</Text>
              )}
              {devices.map((d) => (
                <View key={d.id} style={styles.deviceItem}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.name || "Unknown"}</Text>
                    <Text style={styles.deviceDetails}>
                      Signal: {formatRssi(d.rssi)}
                      {d.batteryPct != null ? ` • Battery: ${d.batteryPct}%` : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.btn, styles.btnSmall]}
                    onPress={() => handleConnect(d.id)}
                    disabled={isConnected}
                  >
                    <Text style={styles.btnLabel}>
                      {connectedId === d.id ? "Connected" : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {/* WiFi Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>WiFi</Text>
              <View style={[styles.statusBadge, isWifiConnected && styles.statusConnected]}>
                <Text style={styles.statusText}>
                  {isWifiConnected ? "CONNECTED" : wifiStatus === "scanning" ? "SCANNING" : "DISCONNECTED"}
                </Text>
              </View>
            </View>

            {wifiError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{wifiError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => {
                if (isWifiConnected) {
                  handleWifiDisconnect();
                } else if (wifiStatus === "scanning") {
                  // Scan in progress
                } else {
                  handleWifiScan();
                }
              }}
              disabled={wifiStatus === "scanning"}
            >
              {wifiStatus === "scanning" ? (
                <ActivityIndicator color="rgba(255,255,255,0.7)" />
              ) : (
                <Text style={styles.btnLabel}>
                  {isWifiConnected ? "Disconnect" : "Scan for Networks"}
                </Text>
              )}
            </Pressable>

            {isWifiConnected && (
              <View style={[styles.deviceItem, { marginBottom: 12 }]}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.label}>Current Network</Text>
                  <Text style={styles.deviceName}>{connectedWifiId}</Text>
                </View>
              </View>
            )}

            <View style={styles.deviceList}>
              <Text style={styles.label}>Available Networks</Text>
              {Platform.OS === "ios" && wifiNetworks.length === 0 && wifiStatus !== "scanning" ? (
                <Text style={styles.hint}>Network scanning is only available on Android.</Text>
              ) : wifiNetworks.length === 0 && wifiStatus !== "scanning" && Platform.OS !== "ios" && (
                <Text style={styles.hint}>Tap “Scan for Networks” to find drone WiFi.</Text>
              )}
              {wifiNetworks.map((n) => (
                <View key={n.id} style={styles.deviceItem}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{n.ssid}</Text>
                    <Text style={styles.deviceDetails}>
                      Signal: {formatWifiSignal(n.signalStrength)}
                      {n.secured ? " • Secured" : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.btn, styles.btnSmall]}
                    onPress={() => handleWifiConnect(n)}
                    disabled={isWifiConnected}
                  >
                    <Text style={styles.btnLabel}>
                      {connectedWifiId === n.id ? "Connected" : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a", alignItems: "center", justifyContent: "center" },
    panel: {
        minWidth: 320,
        maxWidth: 390,
        borderRadius: 40,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "#0b1020",
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 60,
        paddingHorizontal: 32,
        paddingBottom: 100,
    },
    header: {
        marginBottom: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: "800",
        color: "white",
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 12,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 1,
        marginTop: 4,
    },
    section: {
        marginBottom: 40,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "white",
        letterSpacing: 1,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    statusConnected: {
        borderColor: "rgba(0,242,255,0.5)",
        backgroundColor: "rgba(0,242,255,0.1)",
    },
    statusText: {
        fontSize: 10,
        fontWeight: "700",
        color: "rgba(255,255,255,0.6)",
        letterSpacing: 1,
    },
    label: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 12, marginTop: 16 },
    hint: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12 },
    errorBox: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: "rgba(255,80,80,0.15)",
      borderWidth: 1,
      borderColor: "rgba(255,80,80,0.4)",
      marginBottom: 16,
    },
    errorText: { fontSize: 12, color: "rgba(255,200,200,0.9)" },
    btn: {
        height: 80,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
        alignItems: "center",
        justifyContent: "center",
    },
    btnPrimary: {
        borderColor: "rgba(255,255,255,0.15)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    btnSmall: {
        height: 50,
        paddingHorizontal: 20,
    },
    btnLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
    deviceList: {
        marginTop: 20,
    },
    deviceItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.02)",
        marginBottom: 12,
    },
    deviceInfo: {
        flex: 1,
        marginRight: 12,
    },
    deviceName: {
        fontSize: 14,
        fontWeight: "600",
        color: "white",
        marginBottom: 4,
    },
    deviceDetails: {
        fontSize: 10,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 0.5,
    },
});

