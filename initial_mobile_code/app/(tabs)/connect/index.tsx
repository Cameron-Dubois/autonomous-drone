import React, { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from "react-native";
import { getBleClient, type BleDeviceSummary } from "../../../src/comms/BLE";

const SCAN_TIMEOUT_MS = 5000;

function formatRssi(rssi?: number): string {
  if (rssi == null) return "—";
  if (rssi >= -50) return "Strong";
  if (rssi >= -70) return "Good";
  return "Weak";
}

export default function Connect() {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const panelWidth = Math.min(390, SCREEN_WIDTH - 32);
  const [bluetoothStatus, setBluetoothStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
  const [devices, setDevices] = useState<BleDeviceSummary[]>([]);
  const [bleError, setBleError] = useState<string | null>(null);
  const [wifiStatus, setWifiStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");

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
      setBluetoothStatus("connected");
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Connection failed");
      Alert.alert("Connection failed", e instanceof Error ? e.message : "Could not connect to device.");
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setBleError(null);
    try {
      const client = getBleClient();
      await client.disconnect();
      setBluetoothStatus("disconnected");
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Disconnect failed");
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
                            <View style={[styles.statusBadge, wifiStatus === "connected" && styles.statusConnected]}>
                                <Text style={styles.statusText}>
                                    {wifiStatus === "connected" ? "CONNECTED" : wifiStatus === "scanning" ? "SCANNING" : "DISCONNECTED"}
                                </Text>
                            </View>
                        </View>

                        <Pressable
                            style={[styles.btn, styles.btnPrimary]}
                            onPress={() => {
                                if (wifiStatus === "disconnected") {
                                    setWifiStatus("scanning");
                                } else if (wifiStatus === "scanning") {
                                    setWifiStatus("connected");
                                } else {
                                    setWifiStatus("disconnected");
                                }
                            }}
                        >
                            <Text style={styles.btnLabel}>
                                {wifiStatus === "connected" ? "Disconnect" : wifiStatus === "scanning" ? "Scanning..." : "Scan for Networks"}
                            </Text>
                        </Pressable>

                        <View style={styles.deviceList}>
                            <Text style={styles.label}>Available Networks</Text>
                            {wifiStatus === "scanning" && (
                                <Text style={styles.hint}>WiFi support coming soon. Use Bluetooth to connect.</Text>
                            )}
                            <View style={styles.deviceItem}>
                                <View style={styles.deviceInfo}>
                                    <Text style={styles.deviceName}>Drone-Network-5G</Text>
                                    <Text style={styles.deviceDetails}>
                                        Signal: Excellent • Secured
                                        {wifiStatus !== "connected" && " • WiFi coming soon"}
                                    </Text>
                                </View>
                                <Pressable
                                    style={[styles.btn, styles.btnSmall]}
                                    disabled
                                >
                                    <Text style={[styles.btnLabel, { opacity: 0.6 }]}>
                                        {wifiStatus === "connected" ? "Connected" : "Coming soon"}
                                    </Text>
                                </Pressable>
                            </View>
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

