import React, { useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { getBleClient, setStoredDeviceId, type BleDeviceSummary } from "../../../src/comms/BLE";
import { spacing, fontSizes, radii, tabBarHeight } from "../../../src/theme/layout";
import { getWifiClient, type WifiNetworkSummary } from "../../../src/comms/WiFi";
import { isHybridComms } from "../../../src/comms/hybrid-comms";
import { useComms } from "../../../src/context/CommsContext";

const SCAN_TIMEOUT_MS = 5000;
const WIFI_SCAN_TIMEOUT_MS = 2500;

function formatRssi(rssi?: number): string {
  if (rssi == null) return "—";
  const label = rssi >= -50 ? "Strong" : rssi >= -70 ? "Good" : "Weak";
  return `${label} (${rssi} dBm)`;
}

function formatWifiSignal(strength?: number): string {
  if (strength == null) return "—";
  if (strength >= 80) return "Excellent";
  if (strength >= 60) return "Good";
  return "Weak";
}

export default function Connect() {
  const comms = useComms();
  const insets = useSafeAreaInsets();
  const [bluetoothStatus, setBluetoothStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
  const [devices, setDevices] = useState<BleDeviceSummary[]>([]);
  const [bleError, setBleError] = useState<string | null>(null);
  const [wifiStatus, setWifiStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkSummary[]>([]);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [wifiRefresh, setWifiRefresh] = useState(0);
  const [manualCmd, setManualCmd] = useState("");
  const [cmdLog, setCmdLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [securedJoinNetwork, setSecuredJoinNetwork] = useState<WifiNetworkSummary | null>(null);
  const [securedWifiPassword, setSecuredWifiPassword] = useState("");

  const refreshWifiState = useCallback(async () => {
    try {
      const client = getWifiClient();
      await client.refreshConnectionStatus();
      setWifiRefresh((n) => n + 1);
    } catch {
      // WiFi may not be available (Expo Go)
    }
  }, []);

  useEffect(() => {
    void refreshWifiState();
  }, [refreshWifiState]);

  useFocusEffect(
    useCallback(() => {
      void refreshWifiState();
    }, [refreshWifiState])
  );

  const requestBluetoothPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    const apiLevel = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);
    if (apiLevel >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      const scanOk = result["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED;
      const connectOk = result["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED;
      const locationOk = result["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED;
      return scanOk && connectOk && locationOk;
    }
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const handleScan = useCallback(async () => {
    setBleError(null);
    setBluetoothStatus("scanning");
    try {
      const granted = await requestBluetoothPermission();
      if (!granted) {
        setBleError("Bluetooth and Location permissions are required to scan for devices.");
        return;
      }
      const client = getBleClient();
      const list = await client.scan({ timeoutMs: SCAN_TIMEOUT_MS });
      setDevices(list);
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBluetoothStatus("disconnected");
    }
  }, [requestBluetoothPermission]);

  const handleConnect = useCallback(async (deviceId: string) => {
    setBleError(null);
    try {
      const client = getBleClient();
      await client.connect(deviceId);
      setStoredDeviceId(deviceId);
      setBluetoothStatus("connected");
      if (isHybridComms(comms)) {
        comms.syncBleFromExternalConnection();
      }
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Connection failed");
      Alert.alert("Connection failed", e instanceof Error ? e.message : "Could not connect to device.");
    }
  }, [comms]);

  const handleDisconnect = useCallback(async () => {
    setBleError(null);
    try {
      const client = getBleClient();
      await client.disconnect();
      setBluetoothStatus("disconnected");
      if (isHybridComms(comms)) {
        comms.notifyBleDisconnected();
      }
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

  const joinWifiNetwork = useCallback(
    async (network: WifiNetworkSummary, password?: string) => {
      setWifiError(null);
      try {
        const client = getWifiClient();
        await client.connect(network.id, password);
        if (typeof client.refreshConnectionStatus === "function") {
          await client.refreshConnectionStatus();
          setWifiRefresh((n) => n + 1);
        }
        void comms.connect();
        setSecuredJoinNetwork(null);
        setSecuredWifiPassword("");
      } catch (e) {
        setWifiError(e instanceof Error ? e.message : "Connection failed");
        Alert.alert("Connection failed", e instanceof Error ? e.message : "Could not connect to network.");
      }
    },
    [comms]
  );

  const handleWifiConnect = useCallback(
    (network: WifiNetworkSummary) => {
      if (network.secured && Platform.OS === "android") {
        setSecuredJoinNetwork(network);
        setSecuredWifiPassword("");
        return;
      }
      if (network.secured && Platform.OS === "ios") {
        Alert.prompt(
          `Connect to ${network.ssid}`,
          "Enter WiFi password",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Connect",
              onPress: (pw?: string) => {
                void joinWifiNetwork(network, pw || undefined);
              },
            },
          ],
          "secure-text"
        );
        return;
      }
      void joinWifiNetwork(network);
    },
    [joinWifiNetwork]
  );

  const openWifiSettings = useCallback(async () => {
    try {
      await getWifiClient().openSystemWifiSettings();
    } catch (e) {
      Alert.alert("Could not open Wi‑Fi settings", e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  const handleWifiDisconnect = useCallback(async () => {
    setWifiError(null);
    try {
      await comms.disconnect();
      const client = getWifiClient();
      const result = await client.disconnect();
      await client.refreshConnectionStatus();
      setWifiRefresh((n) => n + 1);

      if (!result.disconnected && result.reason === "systemManaged") {
        Alert.alert(
          "Open Wi‑Fi settings",
          "Android only lets the app disconnect networks it joined itself. This network was joined from system settings — open the Wi‑Fi panel to disconnect it.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Wi‑Fi", onPress: () => void openWifiSettings() },
          ]
        );
      } else if (!result.disconnected) {
        setWifiError(result.message ?? "Disconnect failed");
      }
    } catch (e) {
      setWifiError(e instanceof Error ? e.message : "Disconnect failed");
      Alert.alert("Disconnect failed", e instanceof Error ? e.message : "Could not disconnect.");
    }
  }, [comms, openWifiSettings]);

  const handleManualSend = useCallback(async () => {
    const trimmed = manualCmd.trim();
    if (!trimmed) return;
    try {
      const client = getBleClient();
      const hexBytes = trimmed.split(/[\s,]+/).map((s) => parseInt(s, 16));
      if (hexBytes.some(isNaN)) throw new Error("Invalid hex. Use format: 00 01 00");
      await client.sendCommand(new Uint8Array(hexBytes));
      const hexStr = hexBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      setCmdLog((prev) => [{ text: `> ${hexStr}`, ok: true }, ...prev].slice(0, 50));
      setManualCmd("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      setCmdLog((prev) => [{ text: `> ${trimmed}  [ERROR: ${msg}]`, ok: false }, ...prev].slice(0, 50));
    }
  }, [manualCmd]);

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
      void wifiRefresh;
      return getWifiClient().getConnectedNetworkId();
    } catch {
      return null;
    }
  })();
  const isWifiLinked = (() => {
    try {
      void wifiRefresh;
      return getWifiClient().isWifiAssociated();
    } catch {
      return false;
    }
  })();

  const contentTop = insets.top + spacing.lg;
  const contentBottom = insets.bottom + (tabBarHeight ?? 56) + spacing.xl;

  return (
    <View style={styles.root}>
      <Modal
        visible={securedJoinNetwork != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSecuredJoinNetwork(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Wi‑Fi password</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {securedJoinNetwork?.ssid ?? ""}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={securedWifiPassword}
              onChangeText={setSecuredWifiPassword}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.3)"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.btn, styles.modalBtn]} onPress={() => setSecuredJoinNetwork(null)}>
                <Text style={styles.btnLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.modalBtn, styles.btnPrimary]}
                onPress={() => {
                  if (securedJoinNetwork) void joinWifiNetwork(securedJoinNetwork, securedWifiPassword || undefined);
                }}
              >
                <Text style={styles.btnLabel}>Connect</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: contentTop,
            paddingBottom: contentBottom,
            paddingHorizontal: spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
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
              {devices.length === 0 && bluetoothStatus !== "scanning" && (
                <Text style={styles.hint}>Tap "Scan for Devices" to find your drone.</Text>
              )}
              {devices.map((d) => (
                <View key={d.id} style={styles.deviceItem}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName} numberOfLines={1} ellipsizeMode="tail">
                      {d.name || "Unknown"}
                    </Text>
                    <Text style={styles.deviceDetails} numberOfLines={1}>
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

          {/* Manual BLE Command Section */}
          {isConnected && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Manual BLE Command</Text>
              <View style={styles.cmdRow}>
                <TextInput
                  style={styles.cmdInput}
                  value={manualCmd}
                  onChangeText={setManualCmd}
                  placeholder="e.g. 00 01 00 (seq cmd len ...payload)"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleManualSend}
                />
                <Pressable style={[styles.btn, styles.btnSend]} onPress={handleManualSend}>
                  <Text style={styles.btnLabel}>Send</Text>
                </Pressable>
              </View>
              {cmdLog.length > 0 && (
                <View style={styles.cmdLogBox}>
                  {cmdLog.map((entry, i) => (
                    <Text key={i} style={[styles.cmdLogLine, !entry.ok && styles.cmdLogError]}>
                      {entry.text}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* WiFi Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>WiFi</Text>
              <View style={[styles.statusBadge, isWifiLinked && styles.statusConnected]}>
                <Text style={styles.statusText}>
                  {isWifiLinked ? "CONNECTED" : wifiStatus === "scanning" ? "SCANNING" : "DISCONNECTED"}
                </Text>
              </View>
            </View>

            {wifiError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{wifiError}</Text>
              </View>
            ) : null}

            {Platform.OS === "android" ? (
              <>
                <View style={styles.wifiActionRow}>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary, styles.wifiActionHalf]}
                    onPress={() => {
                      if (wifiStatus !== "scanning") handleWifiScan();
                    }}
                    disabled={wifiStatus === "scanning"}
                    hitSlop={8}
                  >
                    {wifiStatus === "scanning" ? (
                      <ActivityIndicator color="rgba(255,255,255,0.7)" />
                    ) : (
                      <Text style={styles.btnLabel}>Scan networks</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.wifiActionHalf]}
                    onPress={() => void handleWifiDisconnect()}
                    disabled={wifiStatus === "scanning"}
                    hitSlop={8}
                  >
                    <Text style={styles.btnLabel}>Disconnect Wi‑Fi</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.btn, styles.btnSecondary, styles.wifiSettingsBtn]}
                  onPress={() => void openWifiSettings()}
                  hitSlop={8}
                >
                  <Text style={styles.btnLabel}>Open Wi‑Fi settings</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => {
                  if (isWifiLinked) {
                    handleWifiDisconnect();
                  } else if (wifiStatus === "scanning") {
                    //
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
                    {isWifiLinked ? "Disconnect" : "Scan for Networks"}
                  </Text>
                )}
              </Pressable>
            )}

            {isWifiLinked && (
              <View style={[styles.deviceItem, { marginBottom: spacing.md }]}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.label}>Current Network</Text>
                  <Text style={styles.deviceName}>
                    {connectedWifiId ?? "Connected (name unavailable on this Android version)"}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.deviceList}>
              <Text style={styles.label}>Available Networks</Text>
              {Platform.OS === "ios" && wifiNetworks.length === 0 && wifiStatus !== "scanning" ? (
                <Text style={styles.hint}>Network scanning is only available on Android.</Text>
              ) : wifiNetworks.length === 0 && wifiStatus !== "scanning" && Platform.OS !== "ios" && (
                <Text style={styles.hint}>Tap "Scan for Networks" to find drone WiFi.</Text>
              )}
              {wifiNetworks.map((n) => (
                <View key={n.id} style={styles.deviceItem}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName} numberOfLines={1} ellipsizeMode="tail">
                      {n.ssid}
                    </Text>
                    <Text style={styles.deviceDetails} numberOfLines={1}>
                      Signal: {formatWifiSignal(n.signalStrength)}
                      {n.secured ? " • Secured" : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.btn, styles.btnSmall]}
                    onPress={() => handleWifiConnect(n)}
                    disabled={isWifiLinked}
                  >
                    <Text style={styles.btnLabel}>
                      {connectedWifiId === n.id ? "Connected" : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a" },
    scrollView: {
        flex: 1,
        width: "100%",
    },
    scrollContent: {
        flexGrow: 1,
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
    },
    content: {
        width: "100%",
    },
    header: {
        marginBottom: spacing.xxxl,
    },
    title: {
        fontSize: fontSizes.xxl,
        fontWeight: "800",
        color: "white",
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 1,
        marginTop: spacing.xs,
    },
    section: {
        marginBottom: spacing.xxxl,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.lg,
        gap: spacing.md,
    },
    sectionTitle: {
        fontSize: fontSizes.lg,
        fontWeight: "700",
        color: "white",
        letterSpacing: 1,
        flex: 1,
        minWidth: 0,
    },
    statusBadge: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm - 2,
        borderRadius: radii.sm,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        flexShrink: 0,
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
    label: { fontSize: fontSizes.xs, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: spacing.md, marginTop: spacing.lg },
    hint: { fontSize: fontSizes.sm, color: "rgba(255,255,255,0.35)", marginBottom: spacing.md },
    errorBox: {
      padding: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: "rgba(255,80,80,0.15)",
      borderWidth: 1,
      borderColor: "rgba(255,80,80,0.4)",
      marginBottom: spacing.lg,
    },
    errorText: { fontSize: fontSizes.sm, color: "rgba(255,200,200,0.9)" },
    btn: {
        minHeight: 72,
        borderRadius: radii.lg,
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
        minHeight: 44,
        paddingHorizontal: spacing.xl,
        flexShrink: 0,
    },
    wifiActionRow: {
        flexDirection: "row",
        gap: spacing.md,
        alignItems: "stretch",
    },
    wifiActionHalf: {
        flex: 1,
        minWidth: 0,
        minHeight: 72,
    },
    wifiSettingsBtn: {
        marginTop: spacing.md,
        minHeight: 52,
    },
    btnSecondary: {
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    btnLabel: { fontSize: fontSizes.sm, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
    deviceList: {
        marginTop: spacing.xl,
    },
    deviceItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.02)",
        marginBottom: spacing.md,
    },
    deviceInfo: {
        flex: 1,
        minWidth: 0,
        marginRight: spacing.md,
    },
    deviceName: {
        fontSize: fontSizes.md,
        fontWeight: "600",
        color: "white",
        marginBottom: spacing.xs,
    },
    deviceDetails: {
        fontSize: fontSizes.xs,
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 0.5,
    },
    cmdRow: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    cmdInput: {
        flex: 1,
        height: 48,
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        paddingHorizontal: spacing.md,
        color: "white",
        fontSize: fontSizes.sm,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    btnSend: {
        minHeight: 48,
        paddingHorizontal: spacing.xl,
        borderColor: "rgba(0,242,255,0.3)",
        backgroundColor: "rgba(0,242,255,0.1)",
    },
    cmdLogBox: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radii.sm,
        backgroundColor: "rgba(255,255,255,0.03)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        maxHeight: 200,
    },
    cmdLogLine: {
        fontSize: fontSizes.xs,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        color: "rgba(0,242,255,0.7)",
        marginBottom: spacing.xs,
    },
    cmdLogError: {
        color: "rgba(255,80,80,0.8)",
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        paddingHorizontal: spacing.xxl,
    },
    modalCard: {
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "#0a0e14",
        padding: spacing.xl,
    },
    modalTitle: {
        fontSize: fontSizes.lg,
        fontWeight: "800",
        color: "white",
        letterSpacing: 1,
    },
    modalSubtitle: {
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.45)",
        marginTop: spacing.xs,
        marginBottom: spacing.lg,
    },
    modalInput: {
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        color: "white",
        fontSize: fontSizes.md,
    },
    modalActions: {
        flexDirection: "row",
        gap: spacing.md,
        marginTop: spacing.lg,
    },
    modalBtn: {
        flex: 1,
        minHeight: 52,
    },
});
