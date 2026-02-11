import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { createMockComms } from "../../../src/comms/mock";
import type { Telemetry } from "../../../src/protocol/types";

export default function Index() {
    const comms = useMemo(() => createMockComms(), []);
    const [tel, setTel] = useState<Telemetry>({
        link: "DISCONNECTED",
        batteryPct: 0,
        batteryMins: 0,
        speedKmh: 0,
        altM: 0,
        rssiBars: 0,
        followMode: false,
    });

    useEffect(() => comms.subscribeTelemetry(setTel), [comms]);

    const barActive = (i: number) => tel.rssiBars >= i;

    return (
        <View style={styles.root}>
            <View style={styles.panel}>
                {/* Status bar */}
                <View style={styles.statusRow}>
                    <View>
                        <Text style={styles.label}>Signal Status</Text>
                        <Text style={styles.mono}>{tel.link}</Text>
                        <View style={styles.signalRow}>
                            {[1, 2, 3, 4].map((i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.signalBar,
                                        { height: 4 + i * 4, opacity: i === 4 ? 0.3 : 1 },
                                        barActive(i) && styles.signalBarActive,
                                    ]}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.label}>Battery Life</Text>
                        <Text style={[styles.mono, styles.teal]}>{tel.batteryPct}%</Text>
                        <Text style={[styles.label, { fontSize: 8, marginTop: 4 }]}>
                            {tel.batteryMins}M REMAINING
                        </Text>
                    </View>
                </View>

                {/* Telemetry */}
                <View style={styles.telemetry}>
                    <Text style={styles.label}>Ground Speed</Text>
                    <Text style={styles.big}>
                        {tel.speedKmh}
                        <Text style={styles.unit}> KM/H</Text>
                    </Text>

                    <View style={{ height: 28 }} />

                    <Text style={styles.label}>Current Altitude</Text>
                    <Text style={styles.big}>
                        {tel.altM}
                        <Text style={styles.unit}> M</Text>
                    </Text>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <Pressable
                        style={[styles.btn, styles.btnPrimary]}
                        onPress={() => comms.send({ type: "FOLLOW_TOGGLE" })}
                    >
                        <Text style={styles.btnLabel}>
                            Auto-Follow Mode: {tel.followMode ? "ON" : "OFF"}
                        </Text>
                    </Pressable>

                    <Pressable style={styles.btn} onPress={() => comms.send({ type: "ASCEND" })}>
                        <Text style={styles.btnLabel}>Ascend</Text>
                    </Pressable>

                    <Pressable style={styles.btn} onPress={() => comms.send({ type: "DESCEND" })}>
                        <Text style={styles.btnLabel}>Descend</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.btn, styles.btnStop]}
                        onPress={() => comms.send({ type: "ESTOP" })}
                    >
                        <Text style={[styles.btnLabel, { color: "#ff3d3d" }]}>Emergency Stop</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.btn, { opacity: tel.link === "SECURE_LINK" ? 0.6 : 1 }]}
                        onPress={() => (tel.link === "SECURE_LINK" ? comms.disconnect() : comms.connect())}
                    >
                        <Text style={styles.btnLabel}>
                            {tel.link === "SECURE_LINK" ? "Disconnect" : "Connect"}
                        </Text>
                    </Pressable>
                </View>
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
        paddingTop: 60,
    },
    statusRow: {
        paddingHorizontal: 32,
        flexDirection: "row",
        justifyContent: "space-between",
    },
    label: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)" },
    mono: { marginTop: 4, fontSize: 14, color: "white" },
    teal: { color: "#00f2ff" },

    signalRow: { flexDirection: "row", gap: 3, alignItems: "flex-end", marginTop: 6 },
    signalBar: { width: 3, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.2)" },
    signalBarActive: { backgroundColor: "#00f2ff" },

    telemetry: { paddingHorizontal: 32, marginTop: 120 },
    big: { fontSize: 72, fontWeight: "800", color: "white", lineHeight: 74 },
    unit: { fontSize: 16, color: "rgba(255,255,255,0.6)" },

    controls: {
        position: "absolute",
        left: 32,
        right: 32,
        bottom: 60,
        gap: 16,
    },
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
        height: 100,
        borderColor: "rgba(255,255,255,0.15)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    btnStop: {
        borderColor: "rgba(255,61,61,0.3)",
        backgroundColor: "rgba(255,61,61,0.05)",
    },
    btnLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
});
