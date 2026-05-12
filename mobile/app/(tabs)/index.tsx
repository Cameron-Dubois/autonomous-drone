import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useComms } from "../../src/context/CommsContext";
import { usePhoneLocation } from "../../src/hooks/usePhoneLocation";
import { createDefaultTelemetry } from "../../src/protocol/types";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../src/theme/layout";
import { TelemetryDroneProvider, useFollowToPhoneNavigation, headingToEastNorthUnit } from "../../src/nav";
import { useFollowMockController } from "../../src/autonomy";
import type { FollowState } from "../../src/autonomy";

export default function HomeScreen() {
    const comms = useComms();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const styles = useMemo(() => getStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
    const [tel, setTel] = useState(createDefaultTelemetry);
    const phoneLoc = usePhoneLocation();

    useEffect(() => {
        const unsubscribe = comms.subscribeTelemetry(setTel);
        return unsubscribe;
    }, [comms]);

    const lastLinkRef = useRef(tel.link);
    lastLinkRef.current = tel.link;

    useFocusEffect(
        useCallback(() => {
            if (lastLinkRef.current === "DISCONNECTED") {
                void comms.connect().catch((e) => {
                    console.warn("[home] comms.connect failed:", e);
                });
            }
        }, [comms])
    );

    const barActive = (i: number) => tel.rssiBars >= i;

    const droneLat = tel.droneLat ?? 0;
    const droneLon = tel.droneLon ?? 0;
    const droneGpsValid = tel.droneGpsValid && tel.droneLat != null && tel.droneLon != null;
    const droneHeadingOk =
        typeof tel.droneHeadingDeg === "number" && Number.isFinite(tel.droneHeadingDeg);
    const compassUnit =
        droneHeadingOk && tel.droneHeadingDeg != null
            ? headingToEastNorthUnit(tel.droneHeadingDeg)
            : null;
    const phoneFixOk = phoneLoc.lat != null && phoneLoc.lon != null;
    const linkOk = tel.link === "SECURE_LINK";
    const linkLabel = linkOk
        ? droneGpsValid
            ? "live"
            : "link OK · awaiting fix"
        : tel.link === "CONNECTING"
          ? "connecting…"
          : "no link";

    // Follow-mock pipeline: telemetry -> DroneFix -> NavigationSnapshot -> controller.
    // NOTE: this hook spins up its own phone-GPS watcher distinct from usePhoneLocation
    // above; Android merges them into one chip session so it's wasteful but correct.
    // TODO: unify the two phone-GPS watchers in a future commit.
    const droneProvider = useMemo(() => new TelemetryDroneProvider(comms), [comms]);
    const navSnap = useFollowToPhoneNavigation({ droneProvider });
    const follow = useFollowMockController({ snapshot: navSnap, comms });

    let followWarning: string | null = null;
    if (!linkOk) followWarning = "No link to drone. Connect on the Connect tab.";
    else if (!phoneFixOk) followWarning = "Waiting for phone GPS fix…";
    else if (!droneGpsValid) followWarning = "Waiting for drone GPS fix…";
    else if (!droneHeadingOk) followWarning = "Waiting for drone compass heading…";

    const canStartFollow = linkOk && phoneFixOk && droneGpsValid && droneHeadingOk;

    const distLabel =
        navSnap.distancePhoneToDrone_m != null
            ? `${navSnap.distancePhoneToDrone_m.toFixed(1)} m`
            : "—";
    const bearLabel =
        navSnap.bearingDroneToPhone_deg != null
            ? `${Math.round(navSnap.bearingDroneToPhone_deg)}°`
            : "—";
    const yawErrLabel =
        navSnap.yawErrorDeg != null
            ? `${navSnap.yawErrorDeg >= 0 ? "+" : ""}${Math.round(navSnap.yawErrorDeg)}°`
            : "—";

    const phaseChipColor: Record<FollowState, { bg: string; border: string; fg: string }> = {
        IDLE: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)", fg: "rgba(255,255,255,0.6)" },
        ROTATE: { bg: "rgba(245,166,35,0.15)", border: "rgba(245,166,35,0.5)", fg: "#f5a623" },
        FORWARD: { bg: "rgba(0,242,255,0.15)", border: "rgba(0,242,255,0.5)", fg: "#00f2ff" },
        HOLD: { bg: "rgba(61,245,122,0.15)", border: "rgba(61,245,122,0.5)", fg: "#3df57a" },
    };
    const chipPalette = phaseChipColor[follow.state];

    const onPressFollow = () => {
        if (follow.running) follow.stop();
        else if (canStartFollow) follow.start();
    };

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

                    <View style={styles.phoneSection}>
                        <Text style={styles.label}>THIS PHONE (GPS)</Text>
                        {phoneLoc.permission === "granted" && phoneLoc.lat != null && phoneLoc.lon != null ? (
                            <>
                                <Text style={[styles.mono, styles.phoneCoords]}>
                                    {phoneLoc.lat.toFixed(6)}°, {phoneLoc.lon.toFixed(6)}°
                                </Text>
                                {phoneLoc.accuracyM != null ? (
                                    <Text style={styles.phoneSub}>±{Math.round(phoneLoc.accuracyM)} m</Text>
                                ) : null}
                            </>
                        ) : phoneLoc.permission === "denied" ? (
                            <>
                                <Text style={styles.phoneMuted}>
                                    Location denied —{" "}
                                    <Text onPress={() => phoneLoc.retryPermission()} style={styles.phoneLink}>
                                        try again
                                    </Text>
                                </Text>
                                {phoneLoc.error ? <Text style={styles.phoneSub}>{phoneLoc.error}</Text> : null}
                            </>
                        ) : (
                            <>
                                <Text style={styles.phoneMuted}>
                                    {phoneLoc.permission === "unknown"
                                        ? "Starting…"
                                        : phoneLoc.error ??
                                          (phoneLoc.permission === "granted" ? "Waiting for fix…" : "Location unavailable")}
                                </Text>
                            </>
                        )}
                    </View>

                    <View style={styles.droneSection}>
                        <Text style={styles.label}>DRONE (GPS)</Text>
                        <Text
                            style={[
                                styles.mono,
                                styles.phoneCoords,
                                droneGpsValid ? styles.teal : styles.droneCoordsMuted,
                            ]}
                        >
                            {droneLat.toFixed(6)}°, {droneLon.toFixed(6)}°
                        </Text>
                        <Text style={styles.phoneSub}>
                            {tel.droneGpsSatellites} sats · fix Q {tel.droneGpsFixQuality}
                            {tel.droneGpsHdop != null ? ` · HDOP ${tel.droneGpsHdop.toFixed(1)}` : ""}
                            {droneHeadingOk ? ` · hdg ${Math.round(tel.droneHeadingDeg as number)}°` : ""}
                            {" · "}
                            {linkLabel}
                        </Text>
                        <Text
                            style={[
                                styles.mono,
                                styles.droneAlt,
                                tel.droneBaroOk ? styles.teal : styles.droneCoordsMuted,
                            ]}
                        >
                            {tel.droneBaroOk
                                ? `${tel.altM >= 0 ? "+" : ""}${tel.altM} m`
                                : "— m"}
                            <Text style={styles.droneAltUnit}>  alt (baro, rel)</Text>
                        </Text>
                    </View>

                <View style={[styles.telemetry, styles.telemetryDisabled]}>
                    <Text style={[styles.label, styles.labelDisabled]}>Ground Speed</Text>
                    <Text style={[styles.big, styles.bigDisabled]}>
                        {tel.speedKmh}
                        <Text style={[styles.unit, styles.unitDisabled]}> KM/H</Text>
                    </Text>
                </View>

                        <View style={styles.followChipRow}>
                            <View
                                style={[
                                    styles.phaseChip,
                                    { backgroundColor: chipPalette.bg, borderColor: chipPalette.border },
                                ]}
                            >
                                <Text style={[styles.phaseChipText, { color: chipPalette.fg }]}>
                                    {follow.state}
                                </Text>
                            </View>
                            <Text style={styles.followReason} numberOfLines={1}>
                                {follow.reason}
                            </Text>
                        </View>

                        <View style={styles.followReadouts}>
                            <Text style={styles.followReadoutItem}>
                                dist <Text style={styles.followReadoutValue}>{distLabel}</Text>
                            </Text>
                            <Text style={styles.followReadoutItem}>
                                bear <Text style={styles.followReadoutValue}>{bearLabel}</Text>
                            </Text>
                            <Text style={styles.followReadoutItem}>
                                yaw err <Text style={styles.followReadoutValue}>{yawErrLabel}</Text>
                            </Text>
                        </View>

                        {followWarning ? (
                            <Text style={styles.followWarning}>{followWarning}</Text>
                        ) : null}

                        <View style={styles.motorBarsBlock}>
                            {[0, 1, 2, 3].map((i) => {
                                const v = follow.motorThrottles[i];
                                const pct = Math.max(0, Math.min(100, (v / 255) * 100));
                                return (
                                    <View key={i} style={styles.motorBarRow}>
                                        <Text style={styles.motorLabel}>M{i + 1}</Text>
                                        <View style={styles.motorBarTrack}>
                                            <View
                                                style={[
                                                    styles.motorBarFill,
                                                    { width: `${pct}%` },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.motorValue}>{v}</Text>
                                    </View>
                                );
                            })}
                        </View>

                        <Pressable
                            style={[
                                styles.btn,
                                styles.followBtn,
                                follow.running ? styles.followBtnStop : styles.followBtnStart,
                                !follow.running && !canStartFollow ? styles.btnDisabled : null,
                            ]}
                            onPress={onPressFollow}
                            disabled={!follow.running && !canStartFollow}
                            hitSlop={8}
                        >
                            <Text style={[styles.btnLabel, follow.running ? styles.followBtnStopLabel : null]}>
                                {follow.running ? "STOP FOLLOW" : "START FOLLOW"}
                            </Text>
                        </Pressable>
                    </View>

                <View style={styles.controls}>
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
    phoneSection: { marginTop: spacing.xxl },
    droneSection: { marginTop: spacing.xl },
    droneCoordsMuted: { color: "rgba(255,255,255,0.45)" },
    droneAlt: {
        marginTop: spacing.sm,
        fontSize: fontSizes.lg,
        fontVariant: ["tabular-nums"],
        fontWeight: "700",
    },
    droneAltUnit: {
        fontSize: fontSizes.xs,
        fontWeight: "400",
        color: "rgba(255,255,255,0.4)",
        letterSpacing: 1.5,
    },
    phoneCoords: { fontVariant: ["tabular-nums"] },
    phoneSub: {
        marginTop: 6,
        fontSize: fontSizes.xs - 1,
        color: "rgba(255,255,255,0.35)",
        letterSpacing: 0.5,
    },
    phoneMuted: { marginTop: spacing.xs, fontSize: fontSizes.sm, color: "rgba(255,255,255,0.35)" },
    phoneLink: { fontSize: fontSizes.sm, color: "#00f2ff", textDecorationLine: "underline" },
    label: { fontSize: fontSizes.xs, letterSpacing: 2, color: "rgba(255,255,255,0.4)" },
    mono: { marginTop: spacing.xs, fontSize: fontSizes.md, color: "white" },
    teal: { color: "#00f2ff" },

    signalRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
    signalBar: { width: 3, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.2)" },
    signalBarActive: { backgroundColor: "#00f2ff" },

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
    btnLabel: { fontSize: fontSizes.sm, fontWeight: "800", letterSpacing: 2, color: "rgba(255,255,255,0.7)" },
    btnDisabled: { opacity: 0.45 },
});
};
