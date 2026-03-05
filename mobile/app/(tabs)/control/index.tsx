import React, { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useComms } from "../../../src/context/CommsContext";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../../src/theme/layout";

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "CENTER";

const ARROW: Record<Direction, string> = {
    NW: "\u2196", N: "\u2191", NE: "\u2197",
    W: "\u2190",  CENTER: "\u25CF", E: "\u2192",
    SW: "\u2199", S: "\u2193", SE: "\u2198",
};

const DPAD_GRID: Direction[][] = [
    ["NW", "N", "NE"],
    ["W", "CENTER", "E"],
    ["SW", "S", "SE"],
];

function DPad({ onPress }: { onPress: (dir: Direction) => void }) {
    const [active, setActive] = useState<Direction | null>(null);

    const handlePressIn = useCallback((dir: Direction) => {
        setActive(dir);
        onPress(dir);
    }, [onPress]);

    const handlePressOut = useCallback(() => {
        setActive(null);
    }, []);

    return (
        <View style={dpadStyles.container}>
            {DPAD_GRID.map((row, ri) => (
                <View key={ri} style={dpadStyles.row}>
                    {row.map((dir) => {
                        const isCenter = dir === "CENTER";
                        const isActive = active === dir;
                        return (
                            <Pressable
                                key={dir}
                                onPressIn={() => handlePressIn(dir)}
                                onPressOut={handlePressOut}
                                style={[
                                    dpadStyles.btn,
                                    isCenter && dpadStyles.centerBtn,
                                    isActive && dpadStyles.btnActive,
                                ]}
                            >
                                <Text style={[
                                    dpadStyles.arrow,
                                    isCenter && dpadStyles.centerArrow,
                                    isActive && dpadStyles.arrowActive,
                                ]}>
                                    {ARROW[dir]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const dpadStyles = StyleSheet.create({
    container: {
        alignSelf: "center",
        gap: spacing.sm,
    },
    row: {
        flexDirection: "row",
        justifyContent: "center",
        gap: spacing.sm,
    },
    btn: {
        width: 72,
        height: 72,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
    },
    centerBtn: {
        backgroundColor: "rgba(0,242,255,0.08)",
        borderColor: "rgba(0,242,255,0.25)",
    },
    btnActive: {
        backgroundColor: "rgba(0,242,255,0.2)",
        borderColor: "rgba(0,242,255,0.5)",
    },
    arrow: {
        fontSize: 26,
        color: "rgba(255,255,255,0.5)",
    },
    centerArrow: {
        fontSize: 18,
        color: "rgba(0,242,255,0.6)",
    },
    arrowActive: {
        color: "#00f2ff",
    },
});

export default function Control() {
    const comms = useComms();
    const { width: screenWidth } = useWindowDimensions();
    const { contentPadding } = getPanelDimensions(screenWidth, 0);

    const handleDPad = useCallback((dir: Direction) => {
        // Placeholder: will be wired to BLE commands later
        console.log("DPAD:", dir);
    }, []);

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Manual Control</Text>
                    <Text style={styles.subtitle}>Direct drone control interface</Text>
                </View>

                <View style={styles.controlArea}>
                    <Text style={styles.label}>D-PAD</Text>
                    <DPad onPress={handleDPad} />
                </View>

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
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a" },
    scroll: { flex: 1 },
    content: {
        paddingTop: spacing.xxxl + 20,
        paddingBottom: spacing.xxxl + 60,
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
    label: { fontSize: fontSizes.xs, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: spacing.lg },
    controlArea: {
        marginBottom: spacing.xxxl,
    },
    quickActions: {
        marginBottom: spacing.xxxl,
    },
    actionRow: {
        flexDirection: "row",
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    btn: {
        minHeight: 72,
        borderRadius: radii.lg,
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
    btnLabel: { fontSize: fontSizes.sm, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
});
