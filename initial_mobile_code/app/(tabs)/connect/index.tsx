import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";

export default function Connect() {
    const [bluetoothStatus, setBluetoothStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");
    const [wifiStatus, setWifiStatus] = useState<"disconnected" | "scanning" | "connected">("disconnected");

    return (
        <View style={styles.root}>
            <View style={styles.panel}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Connection</Text>
                        <Text style={styles.subtitle}>Connect to drone via Bluetooth or WiFi</Text>
                    </View>

                    {/* Bluetooth Section */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Bluetooth</Text>
                            <View style={[styles.statusBadge, bluetoothStatus === "connected" && styles.statusConnected]}>
                                <Text style={styles.statusText}>
                                    {bluetoothStatus === "connected" ? "CONNECTED" : bluetoothStatus === "scanning" ? "SCANNING" : "DISCONNECTED"}
                                </Text>
                            </View>
                        </View>

                        <Pressable
                            style={[styles.btn, styles.btnPrimary]}
                            onPress={() => {
                                if (bluetoothStatus === "disconnected") {
                                    setBluetoothStatus("scanning");
                                } else if (bluetoothStatus === "scanning") {
                                    setBluetoothStatus("connected");
                                } else {
                                    setBluetoothStatus("disconnected");
                                }
                            }}
                        >
                            <Text style={styles.btnLabel}>
                                {bluetoothStatus === "connected" ? "Disconnect" : bluetoothStatus === "scanning" ? "Scanning..." : "Scan for Devices"}
                            </Text>
                        </Pressable>

                        <View style={styles.deviceList}>
                            <Text style={styles.label}>Available Devices</Text>
                            <View style={styles.deviceItem}>
                                <View style={styles.deviceInfo}>
                                    <Text style={styles.deviceName}>Drone-ABC123</Text>
                                    <Text style={styles.deviceDetails}>Signal: Strong • Battery: 84%</Text>
                                </View>
                                <Pressable style={[styles.btn, styles.btnSmall]}>
                                    <Text style={styles.btnLabel}>Connect</Text>
                                </Pressable>
                            </View>
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
                            <View style={styles.deviceItem}>
                                <View style={styles.deviceInfo}>
                                    <Text style={styles.deviceName}>Drone-Network-5G</Text>
                                    <Text style={styles.deviceDetails}>Signal: Excellent • Secured</Text>
                                </View>
                                <Pressable style={[styles.btn, styles.btnSmall]}>
                                    <Text style={styles.btnLabel}>Connect</Text>
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
        width: 390,
        height: 844,
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

