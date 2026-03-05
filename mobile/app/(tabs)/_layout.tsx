import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useComms } from "../../src/context/CommsContext";
import { spacing, fontSizes, radii } from "../../src/theme/layout";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const TAB_LABELS: Record<string, string> = {
    index: "Home",
    "connect/index": "Connect",
    "control/index": "Control",
    "video/index": "Video",
};

const ANDROID_NAV_FALLBACK = 48;

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const isAndroid = Platform.OS === "android" || Platform.OS === "linux";
    const bottomSafe = isAndroid && insets.bottom < 10 ? ANDROID_NAV_FALLBACK : insets.bottom;

    return (
        <View style={[styles.tabBar, { paddingBottom: bottomSafe }]}>
            {state.routes.map((route, i) => {
                const focused = state.index === i;
                const label = TAB_LABELS[route.name] ?? route.name;
                return (
                    <Pressable
                        key={route.key}
                        style={styles.tab}
                        onPress={() => {
                            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                            if (!focused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        }}
                        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                    >
                        <Text style={[styles.tabText, focused && styles.tabTextActive]}>
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function TabLayout() {
    const comms = useComms();
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <Tabs
                tabBar={(props) => <CustomTabBar {...props} />}
                screenOptions={{ headerShown: false }}
            >
                <Tabs.Screen name="index" />
                <Tabs.Screen name="connect/index" />
                <Tabs.Screen name="control/index" />
                <Tabs.Screen name="video/index" />
            </Tabs>
            <Pressable
                style={[styles.estopButton, { top: insets.top + spacing.sm }]}
                onPress={() => comms.send({ type: "ESTOP" })}
            >
                <Text style={styles.estopText}>E-STOP</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabBar: {
        flexDirection: "row",
        backgroundColor: "#0b1020",
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
        height: "auto",
    },
    tab: {
        flex: 1,
        alignItems: "center",
        paddingVertical: spacing.md,
    },
    tabText: {
        fontSize: fontSizes.sm,
        fontWeight: "600",
        color: "rgba(255,255,255,0.4)",
    },
    tabTextActive: {
        color: "#00f2ff",
    },
    estopButton: {
        position: "absolute",
        right: spacing.lg,
        zIndex: 1000,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radii.sm,
        backgroundColor: "rgba(255,61,61,0.2)",
        borderWidth: 1,
        borderColor: "rgba(255,61,61,0.6)",
    },
    estopText: {
        fontSize: fontSizes.xs,
        fontWeight: "800",
        color: "#ff3d3d",
        letterSpacing: 1,
    },
});
