import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, Alert } from "react-native";
import { useComms } from "../../src/context/CommsContext";
import type { Telemetry } from "../../src/protocol/types";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../src/theme/layout";

export default function HomeScreen() {
    const comms = useComms();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const styles = useMemo(() => getStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
    const [tel, setTel] = useState<Telemetry>({
        link: "DISCONNECTED",
        batteryPct: 0,
        batteryMins: 0,
        speedKmh: 0,
        altM: 0,
        rssiBars: 0,
        followMode: false,
    });

    useEffect(() => {
        const unsubscribe = comms.subscribeTelemetry(setTel);
        return unsubscribe;
    }, [comms]);

    const barActive = (i: number) => tel.rssiBars >= i;

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.content}>
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
                                        { height: spacing.xs + i * spacing.xs, opacity: i === 4 ? 0.3 : 1, marginRight: i < 4 ? 3 : 0 },
                                        barActive(i) && styles.signalBarActive,
                                    ]}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.label}>Battery Life</Text>
                        <Text style={[styles.mono, styles.teal]}>{tel.batteryPct}%</Text>
                        <Text style={[styles.label, { fontSize: fontSizes.xs - 2, marginTop: spacing.xs }]}>
                            {tel.batteryMins}M REMAINING
                        </Text>
                    </View>
                </View>

                <View style={styles.telemetry}>
                    <Text style={styles.label}>Ground Speed</Text>
                    <Text style={styles.big}>
                        {tel.speedKmh}
                        <Text style={styles.unit}> KM/H</Text>
                    </Text>

                    <View style={{ height: spacing.xxl }} />

                    <Text style={styles.label}>Current Altitude</Text>
                    <Text style={styles.big}>
                        {tel.altM}
                        <Text style={styles.unit}> M</Text>
                    </Text>
                </View>

                <View style={styles.controls}>
                    <Pressable
                        style={[styles.btn, styles.btnPrimary, styles.btnSpacing]}
                        onPress={() => comms.send({ type: "FOLLOW_TOGGLE" })}
                    >
                        <Text style={styles.btnLabel}>
                            Auto-Follow Mode: {tel.followMode ? "ON" : "OFF"}
                        </Text>
                    </Pressable>

                    <Pressable style={[styles.btn, styles.btnSpacing]} onPress={() => comms.send({ type: "ASCEND" })}>
                        <Text style={styles.btnLabel}>Ascend</Text>
                    </Pressable>

                    <Pressable style={[styles.btn, styles.btnSpacing]} onPress={() => comms.send({ type: "DESCEND" })}>
                        <Text style={styles.btnLabel}>Descend</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.btn, { opacity: tel.link === "SECURE_LINK" ? 0.6 : 1 }]}
                        onPress={async () => {
                            try {
                                if (tel.link === "SECURE_LINK") await comms.disconnect();
                                else await comms.connect();
                            } catch (e) {
                                Alert.alert("Connection", e instanceof Error ? e.message : "Connection failed");
                            }
                        }}
                    >
                        <Text style={styles.btnLabel}>
                            {tel.link === "SECURE_LINK" ? "Disconnect" : "Connect"}
                        </Text>
                    </Pressable>
                </View>
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (screenWidth: number, screenHeight: number) => {
    const { contentPadding } = getPanelDimensions(screenWidth, screenHeight);
    return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a" },
    content: {
        flex: 1,
        paddingTop: spacing.xxxl + 20,
        paddingHorizontal: contentPadding,
    },
    statusRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    label: { fontSize: fontSizes.xs, letterSpacing: 2, color: "rgba(255,255,255,0.4)" },
    mono: { marginTop: spacing.xs, fontSize: fontSizes.md, color: "white" },
    teal: { color: "#00f2ff" },

    signalRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
    signalBar: { width: 3, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.2)" },
    signalBarActive: { backgroundColor: "#00f2ff" },

    telemetry: { marginTop: 80 },
    big: { fontSize: fontSizes.xxxl, fontWeight: "800", color: "white", lineHeight: 76 },
    unit: { fontSize: fontSizes.lg, color: "rgba(255,255,255,0.6)" },

    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + 40 },
    controls: {
        marginTop: spacing.xxxl,
    },
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
        minHeight: 88,
        borderColor: "rgba(255,255,255,0.15)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    btnLabel: { fontSize: fontSizes.sm, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
    btnSpacing: { marginBottom: spacing.lg },
});
};
