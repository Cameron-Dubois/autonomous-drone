import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useComms } from "../../src/context/CommsContext";
import { usePhoneLocation } from "../../src/hooks/usePhoneLocation";
import { createDefaultTelemetry } from "../../src/protocol/types";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../src/theme/layout";
import { TelemetryDroneProvider, useFollowToPhoneNavigation, haversineDistanceM, isValidLatLon } from "../../src/nav";
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

    const fallbackDistanceM =
        phoneLoc.lat != null &&
        phoneLoc.lon != null &&
        tel.droneLat != null &&
        tel.droneLon != null &&
        tel.droneGpsValid &&
        isValidLatLon({ lat: phoneLoc.lat, lon: phoneLoc.lon }) &&
        isValidLatLon({ lat: tel.droneLat, lon: tel.droneLon })
            ? haversineDistanceM(
                  { lat: tel.droneLat, lon: tel.droneLon },
                  { lat: phoneLoc.lat, lon: phoneLoc.lon }
              )
            : null;

    const distancePhoneDroneM = navSnap.distancePhoneToDrone_m ?? fallbackDistanceM;

    let followWarning: string | null = null;
    if (!linkOk) followWarning = "No link to drone. Connect on the Connect tab.";
    else if (!phoneFixOk) followWarning = "Waiting for phone GPS fix…";
    else if (!droneGpsValid) followWarning = "Waiting for drone GPS fix…";
    else if (!droneHeadingOk) followWarning = "Waiting for drone compass heading…";

    const canStartFollow = linkOk && phoneFixOk && droneGpsValid && droneHeadingOk;

    const distLabel =
        distancePhoneDroneM != null ? `${distancePhoneDroneM.toFixed(1)} m` : "—";
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
        RETREAT: { bg: "rgba(255,80,80,0.15)", border: "rgba(255,80,80,0.5)", fg: "#ff5050" },
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

                    <View style={styles.navMetricsSection}>
                        <View style={styles.navMetricsRow}>
                            <View style={styles.navMetricCol}>
                                <Text style={styles.navMetricHeading}>DISTANCE</Text>
                                <Text
                                    style={[
                                        styles.navMetricValue,
                                        distancePhoneDroneM != null ? styles.teal : styles.droneCoordsMuted,
                                    ]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {distLabel}
                                </Text>
                                <Text style={styles.navMetricUnit}>phone ↔ drone</Text>
                            </View>
                            <View style={styles.navMetricCol}>
                                <Text style={styles.navMetricHeading}>BEARING</Text>
                                <Text
                                    style={[
                                        styles.navMetricValue,
                                        navSnap.bearingDroneToPhone_deg != null ? styles.teal : styles.droneCoordsMuted,
                                    ]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {bearLabel}
                                </Text>
                                <Text style={styles.navMetricUnit}>to phone</Text>
                            </View>
                            <View style={styles.navMetricCol}>
                                <Text style={styles.navMetricHeading}>BARO ALT</Text>
                                <Text
                                    style={[
                                        styles.navMetricValue,
                                        tel.droneBaroOk ? styles.teal : styles.droneCoordsMuted,
                                    ]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {tel.droneBaroOk
                                        ? `${tel.altM >= 0 ? "+" : ""}${tel.altM} m`
                                        : "—"}
                                </Text>
                                <Text style={styles.navMetricUnit}>rel · baro</Text>
                            </View>
                        </View>
                        <Text style={styles.phoneSub}>
                            {navSnap.distancePhoneToDrone_m != null
                                ? "Distance: high-accuracy phone fix + drone GPS (great-circle)."
                                : fallbackDistanceM != null
                                  ? "Distance: great-circle from coordinates (nav waiting on GPS quality or age)."
                                  : "Distance needs reliable phone and drone lat/lon."}
                        </Text>
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
                    </View>

                    <View style={styles.baroTestSection}>
                        <Text style={styles.label}>DRONE BAROMETER (TEST)</Text>
                        <View style={styles.baroTestCard}>
                            <View style={styles.baroTestRow}>
                                <Text style={styles.baroTestK}>droneBaroOk</Text>
                                <Text
                                    style={[
                                        styles.mono,
                                        { marginTop: 0 },
                                        tel.droneBaroOk ? styles.teal : styles.droneCoordsMuted,
                                    ]}
                                >
                                    {tel.droneBaroOk ? "true" : "false"}
                                </Text>
                            </View>
                            <Text style={styles.baroTestHint}>
                                Altitude shown above is relative Δ vs first good pressure sample after boot (firmware
                                baseline).
                            </Text>
                        </View>
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
    navMetricsSection: { marginTop: spacing.xl },
    navMetricsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.sm,
        marginTop: spacing.sm,
    },
    navMetricCol: {
        flex: 1,
        minWidth: 0,
        alignItems: "center",
    },
    navMetricHeading: {
        fontSize: fontSizes.xs,
        letterSpacing: 1.2,
        color: "rgba(255,255,255,0.4)",
        textAlign: "center",
    },
    navMetricValue: {
        marginTop: spacing.xs,
        fontSize: Math.round(fontSizes.xxxl * 0.62),
        fontWeight: "800",
        fontVariant: ["tabular-nums"],
        letterSpacing: -0.5,
        textAlign: "center",
    },
    navMetricUnit: {
        marginTop: 4,
        fontSize: fontSizes.xs - 2,
        color: "rgba(255,255,255,0.32)",
        letterSpacing: 0.4,
        textAlign: "center",
    },
    droneSection: { marginTop: spacing.xl },
    baroTestSection: { marginTop: spacing.xl },
    baroTestCard: {
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: "rgba(0,242,255,0.25)",
        backgroundColor: "rgba(0,242,255,0.06)",
    },
    baroTestRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 0,
    },
    baroTestK: {
        fontSize: fontSizes.xs,
        color: "rgba(255,255,255,0.35)",
        letterSpacing: 0.5,
        fontVariant: ["tabular-nums"],
    },
    baroTestHint: {
        marginTop: spacing.sm,
        fontSize: fontSizes.xs - 1,
        color: "rgba(255,255,255,0.32)",
        letterSpacing: 0.3,
    },
    droneCoordsMuted: { color: "rgba(255,255,255,0.45)" },
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
    followChipRow: {
        marginTop: spacing.xl,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
    },
    phaseChip: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm + 2,
        borderRadius: radii.md,
        borderWidth: 1,
        minWidth: 112,
        alignItems: "center",
        justifyContent: "center",
    },
    phaseChipText: {
        fontSize: fontSizes.lg,
        fontWeight: "800",
        letterSpacing: 1.5,
    },
    followReason: {
        flex: 1,
        fontSize: fontSizes.xs,
        color: "rgba(255,255,255,0.35)",
    },
    followReadouts: {
        marginTop: spacing.md,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.md,
    },
    followReadoutItem: {
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.45)",
    },
    followReadoutValue: {
        color: "#00f2ff",
        fontVariant: ["tabular-nums"],
        fontWeight: "600",
    },
    followWarning: {
        marginTop: spacing.md,
        fontSize: fontSizes.sm,
        color: "rgba(245,166,35,0.9)",
    },
    motorBarsBlock: {
        marginTop: spacing.lg,
        gap: spacing.xs,
    },
    motorBarRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
    },
    motorLabel: {
        width: 28,
        fontSize: fontSizes.xs,
        color: "rgba(255,255,255,0.45)",
    },
    motorBarTrack: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: "rgba(255,255,255,0.08)",
        overflow: "hidden",
    },
    motorBarFill: {
        height: "100%",
        backgroundColor: "rgba(0,242,255,0.5)",
    },
    motorValue: {
        width: 36,
        fontSize: fontSizes.xs,
        color: "rgba(255,255,255,0.5)",
        fontVariant: ["tabular-nums"],
        textAlign: "right",
    },
    followBtn: {
        marginTop: spacing.lg,
    },
    followBtnStart: {
        borderColor: "rgba(0,242,255,0.35)",
        backgroundColor: "rgba(0,242,255,0.08)",
    },
    followBtnStop: {
        borderColor: "rgba(245,80,80,0.45)",
        backgroundColor: "rgba(245,80,80,0.12)",
    },
    followBtnStopLabel: {
        color: "rgba(255,180,180,0.95)",
    },
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
