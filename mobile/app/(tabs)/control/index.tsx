import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useComms } from "../../../src/context/CommsContext";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../../src/theme/layout";
import { buildRawCommandBytes, DroneCmd } from "../../../src/protocol/types";

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "CENTER";

const ARROW: Record<Direction, string> = {
    NW: "\u2196", N: "\u2191", NE: "\u2197",
    W: "\u2190",  CENTER: "Arm", E: "\u2192",
    SW: "\u2199", S: "\u2193", SE: "\u2198",
};

const DPAD_GRID: Direction[][] = [
    ["NW", "N", "NE"],
    ["W", "CENTER", "E"],
    ["SW", "S", "SE"],
];

/** Maps each D-pad direction (except CENTER) to the motor command(s) it controls */
const DIR_TO_MOTORS: Record<Exclude<Direction, "CENTER">, number[]> = {
    SW: [DroneCmd.SET_MOTOR_1],
    NW: [DroneCmd.SET_MOTOR_2],
    NE: [DroneCmd.SET_MOTOR_3],
    SE: [DroneCmd.SET_MOTOR_4],
    W: [DroneCmd.SET_MOTOR_1, DroneCmd.SET_MOTOR_2],
    N: [DroneCmd.SET_MOTOR_2, DroneCmd.SET_MOTOR_3],
    E: [DroneCmd.SET_MOTOR_3, DroneCmd.SET_MOTOR_4],
    S: [DroneCmd.SET_MOTOR_1, DroneCmd.SET_MOTOR_4],
};

/** Maps DroneCmd.SET_MOTOR_X to motor index 0-3 */
const MOTOR_CMD_TO_INDEX: Record<number, number> = {
    [DroneCmd.SET_MOTOR_1]: 0,
    [DroneCmd.SET_MOTOR_2]: 1,
    [DroneCmd.SET_MOTOR_3]: 2,
    [DroneCmd.SET_MOTOR_4]: 3,
};

function DPad({
    onPress,
}: {
    onPress: (dir: Direction) => void;
}) {
    const [active, setActive] = useState<Direction | null>(null);

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
                                onPressIn={() => setActive(dir)}
                                onPressOut={() => setActive(null)}
                                onPress={() => onPress(dir)}
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
    const [takeoffActive, setTakeoffActive] = useState(false);
    const [motorPercents, setMotorPercents] = useState([0, 0, 0, 0]);
    const takeoffIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (takeoffIntervalRef.current) {
                clearInterval(takeoffIntervalRef.current);
            }
        };
    }, []);

    const THROTTLE_0 = 0;
    const THROTTLE_10 = Math.round(255 * 0.1);

    const percentToThrottle = (p: number) => Math.round(255 * Math.min(100, Math.max(0, p)) / 100);

    const sendMotor = useCallback(async (motorCmd: number, throttle: number) => {
        try {
            const { getBleClient } = await import("../../../src/comms/BLE");
            const client = getBleClient();
            await client.sendCommand(buildRawCommandBytes(motorCmd, [throttle]));
        } catch (e) {
            console.log("BLE send failed:", e);
        }
    }, []);

    const sendMotors = useCallback(async (motorCmds: number[], throttle: number) => {
        for (const m of motorCmds) {
            await sendMotor(m, throttle);
        }
    }, [sendMotor]);

    const handleDPadPress = useCallback(async (dir: Direction) => {
        try {
            if (dir === "CENTER") {
                const { getBleClient } = await import("../../../src/comms/BLE");
                const client = getBleClient();
                await client.sendCommand(buildRawCommandBytes(DroneCmd.ARM));
                return;
            }
            const motors = DIR_TO_MOTORS[dir];
            const next = [...motorPercents];
            for (const cmd of motors) {
                const idx = MOTOR_CMD_TO_INDEX[cmd];
                next[idx] = Math.min(motorPercents[idx] + 5, 100);
            }
            setMotorPercents(next);
            for (const cmd of motors) {
                const idx = MOTOR_CMD_TO_INDEX[cmd];
                await sendMotor(cmd, percentToThrottle(next[idx]));
            }
        } catch (e) {
            console.log("BLE send failed:", e);
        }
    }, [motorPercents, sendMotor]);

    const handleTakeoff = useCallback(async () => {
        // Clear any existing takeoff ramp
        if (takeoffIntervalRef.current) {
            clearInterval(takeoffIntervalRef.current);
            takeoffIntervalRef.current = null;
        }

        await comms.send({ type: "ARM" });
        setTakeoffActive(true);

        const allMotors = [
            DroneCmd.SET_MOTOR_1,
            DroneCmd.SET_MOTOR_2,
            DroneCmd.SET_MOTOR_3,
            DroneCmd.SET_MOTOR_4,
        ];

        // Start at 10%
        setMotorPercents([10, 10, 10, 10]);
        let currentPercent = 10;
        await sendMotors(allMotors, percentToThrottle(currentPercent));

        // Every 1 second, increase by 5% until 100%
        takeoffIntervalRef.current = setInterval(async () => {
            currentPercent = Math.min(currentPercent + 5, 100);
            setMotorPercents([currentPercent, currentPercent, currentPercent, currentPercent]);
            await sendMotors(allMotors, percentToThrottle(currentPercent));
            if (currentPercent >= 100) {
                if (takeoffIntervalRef.current) {
                    clearInterval(takeoffIntervalRef.current);
                    takeoffIntervalRef.current = null;
                }
            }
        }, 1000);
    }, [comms, sendMotors]);

    const handleLand = useCallback(async () => {
        if (takeoffIntervalRef.current) {
            clearInterval(takeoffIntervalRef.current);
            takeoffIntervalRef.current = null;
        }
        await comms.send({ type: "LAND" });
        setTakeoffActive(false);
        setMotorPercents([0, 0, 0, 0]);
        await sendMotors(
            [DroneCmd.SET_MOTOR_1, DroneCmd.SET_MOTOR_2, DroneCmd.SET_MOTOR_3, DroneCmd.SET_MOTOR_4],
            THROTTLE_0,
        );
    }, [comms, sendMotors]);

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
                    <DPad onPress={handleDPadPress} />
                </View>

                <View style={styles.debugPanel}>
                    {[0, 1, 2, 3].map((i) => (
                        <View key={i} style={styles.debugCell}>
                            <Text style={styles.debugLabel}>M{i + 1}</Text>
                            <Text style={styles.debugValue}>{motorPercents[i]}%</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.quickActions}>
                    <Text style={styles.label}>Quick Actions</Text>
                    <View style={styles.actionRow}>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={handleTakeoff}>
                            <Text style={styles.btnLabel}>Takeoff</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={handleLand}>
                            <Text style={styles.btnLabel}>Land</Text>
                        </Pressable>
                    </View>
                    <View style={styles.actionRow}>
                        <Pressable style={[styles.btn, styles.btnSmall]} onPress={async () => {
                            setMotorPercents([10, 10, 10, 10]);
                            await sendMotors(
                                [DroneCmd.SET_MOTOR_1, DroneCmd.SET_MOTOR_2, DroneCmd.SET_MOTOR_3, DroneCmd.SET_MOTOR_4],
                                THROTTLE_10,
                            );
                        }}>
                            <Text style={styles.btnLabel}>Hover</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.btnSmall, styles.btnDisabled]} disabled>
                            <Text style={[styles.btnLabel, styles.btnLabelDisabled]}>Return Home</Text>
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
        marginBottom: spacing.lg,
    },
    debugPanel: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.sm,
        marginBottom: spacing.xxxl,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: "rgba(0,0,0,0.3)",
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
    },
    debugCell: {
        flex: 1,
        alignItems: "center",
    },
    debugLabel: {
        fontSize: 10,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.4)",
    },
    debugValue: {
        fontSize: fontSizes.sm,
        fontWeight: "700",
        color: "#00f2ff",
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
    btnDisabled: { opacity: 0.45 },
    btnLabelDisabled: { color: "rgba(255,255,255,0.35)" },
});
