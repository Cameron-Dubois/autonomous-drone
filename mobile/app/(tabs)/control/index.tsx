import React from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { useComms } from "../../../src/context/CommsContext";

export default function Control() {
    const comms = useComms();
    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
    const panelWidth = Math.min(390, SCREEN_WIDTH - 32);
    const panelHeight = Math.min(844, SCREEN_HEIGHT - 32);

    return (
        <View style={styles.root}>
            <View style={[styles.panel, { width: panelWidth, height: panelHeight }]}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Manual Control</Text>
                    <Text style={styles.subtitle}>Direct drone control interface</Text>
                </View>

                {/* Control Area */}
                <View style={styles.controlArea}>
                    <Text style={styles.label}>Control Pad</Text>
                    <View style={styles.placeholder}>
                        <Text style={styles.placeholderText}>Joystick Controls</Text>
                        <Text style={styles.placeholderSubtext}>Coming soon</Text>
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <Text style={styles.label}>Quick Actions</Text>
                    <View style={styles.actionRow}>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={() => comms.send({ type: "TAKEOFF" })}>
                            <Text style={styles.btnLabel}>Takeoff</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={() => comms.send({ type: "LAND" })}>
                            <Text style={styles.btnLabel}>Land</Text>
                        </Pressable>
                    </View>
                    <View style={styles.actionRow}>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={() => comms.send({ type: "HOVER" })}>
                            <Text style={styles.btnLabel}>Hover</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={() => comms.send({ type: "RETURN_HOME" })}>
                            <Text style={styles.btnLabel}>Return Home</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Emergency Stop */}
                <View style={styles.emergencySection}>
                    <Pressable style={[styles.btn, styles.btnStop]} onPress={() => comms.send({ type: "ESTOP" })}>
                        <Text style={[styles.btnLabel, { color: "#ff3d3d" }]}>Emergency Stop</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a", alignItems: "center", justifyContent: "center" },
    panel: {
        minWidth: 320,
        maxWidth: 390,
        maxHeight: 844,
        borderRadius: 40,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "#0b1020",
        paddingTop: 60,
        paddingHorizontal: 32,
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
    label: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 16 },
    controlArea: {
        marginBottom: 40,
    },
    placeholder: {
        height: 300,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
        alignItems: "center",
        justifyContent: "center",
    },
    placeholderText: {
        fontSize: 16,
        fontWeight: "600",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1,
    },
    placeholderSubtext: {
        fontSize: 12,
        color: "rgba(255,255,255,0.3)",
        marginTop: 8,
    },
    quickActions: {
        marginBottom: 40,
    },
    actionRow: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 12,
    },
    btn: {
        height: 80,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    btnSmall: {
        height: 70,
    },
    btnStop: {
        borderColor: "rgba(255,61,61,0.3)",
        backgroundColor: "rgba(255,61,61,0.05)",
    },
    btnLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
    emergencySection: {
        position: "absolute",
        left: 32,
        right: 32,
        bottom: 60,
    },
});

