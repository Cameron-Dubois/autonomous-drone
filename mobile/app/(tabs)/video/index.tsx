import React, { useCallback, useState } from "react";
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    ScrollView,
    useWindowDimensions,
    ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../../src/theme/layout";
import { getWifiClient } from "../../../src/comms/WiFi";
import { buildDroneRootUrl, buildDroneStreamUrl, probeDroneReachable } from "../../../src/stream/droneStream";

const POLL_MS = 2500;

function buildMjpegViewerHtml(streamUrl: string): string {
    const safe = streamUrl.replace(/"/g, "&quot;");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/><style>html,body{margin:0;padding:0;height:100%;background:#000}#s{width:100%;height:100%;object-fit:contain}</style></head><body><img id="s" src="${safe}" alt=""/></body></html>`;
}

type LinkState = "disconnected" | "wifi_only" | "stream_ready";

function deriveLinkState(ssid: string | null, reachable: boolean): LinkState {
    if (reachable) return "stream_ready";
    if (ssid) return "wifi_only";
    return "disconnected";
}

export default function Video() {
    const { width: screenWidth } = useWindowDimensions();
    const { contentPadding } = getPanelDimensions(screenWidth, 0);

    const [ssid, setSsid] = useState<string | null>(null);
    const [reachable, setReachable] = useState(false);
    const [probeBusy, setProbeBusy] = useState(true);
    const [streamError, setStreamError] = useState(false);

    const refreshWifiAndProbe = useCallback(async () => {
        setStreamError(false);
        try {
            const wifi = getWifiClient();
            await wifi.refreshConnectionStatus();
            setSsid(wifi.getConnectedNetworkId());
        } catch {
            setSsid(null);
        }
        const ok = await probeDroneReachable();
        setReachable(ok);
        setProbeBusy(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            let alive = true;
            setProbeBusy(true);
            void refreshWifiAndProbe();
            const id = setInterval(() => {
                if (alive) void refreshWifiAndProbe();
            }, POLL_MS);
            return () => {
                alive = false;
                clearInterval(id);
            };
        }, [refreshWifiAndProbe])
    );

    const linkState = deriveLinkState(ssid, reachable);
    const streamUrl = buildDroneStreamUrl();
    const showStream = linkState === "stream_ready" && !streamError;

    const placeholderTitle =
        linkState === "disconnected"
            ? "No drone Wi‑Fi"
            : linkState === "wifi_only"
              ? "Drone not responding"
              : "Stream unavailable";

    const connectionLabel =
        linkState === "stream_ready"
            ? "Connected"
            : linkState === "wifi_only"
              ? "No drone HTTP"
              : "Disconnected";

    const connectionStyle =
        linkState === "stream_ready"
            ? styles.infoValueConnected
            : linkState === "wifi_only"
              ? styles.infoValueWarning
              : styles.infoValueDisconnected;

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.content, { paddingHorizontal: contentPadding }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Live Video</Text>
                        <Text style={styles.subtitle}>Real-time drone camera feed</Text>
                    </View>

                    <View style={styles.videoContainer}>
                        {probeBusy && (
                            <View style={styles.probeOverlay}>
                                <ActivityIndicator size="large" color="#00f2ff" />
                                <Text style={styles.probeText}>Checking drone…</Text>
                            </View>
                        )}

                        {!probeBusy && !showStream && (
                            <View style={styles.videoPlaceholder}>
                                <View style={styles.videoIcon}>
                                    <Ionicons name="videocam-off" size={fontSizes.xxl * 2} color="rgba(255,255,255,0.4)" />
                                </View>
                                <Text style={styles.placeholderText}>{placeholderTitle}</Text>
                                <Text style={styles.placeholderSubtext}>
                                    Join the drone access point on the Connect tab, then return here.
                                </Text>
                            </View>
                        )}

                        {showStream && (
                            <WebView
                                style={styles.webView}
                                originWhitelist={["*"]}
                                source={{ html: buildMjpegViewerHtml(streamUrl), baseUrl: buildDroneRootUrl() }}
                                scrollEnabled={false}
                                mixedContentMode="always"
                                onError={() => setStreamError(true)}
                                onHttpError={() => setStreamError(true)}
                            />
                        )}

                        <View style={styles.videoControls}>
                            <View style={styles.controlRow}>
                                <Pressable style={styles.controlButton} onPress={() => {}}>
                                    <Ionicons name="pause" size={fontSizes.xxl} color="white" />
                                </Pressable>
                                <Pressable style={styles.controlButton} onPress={() => {}}>
                                    <Ionicons name="stop" size={fontSizes.xxl} color="white" />
                                </Pressable>
                                <Pressable style={styles.controlButton} onPress={() => {}}>
                                    <Ionicons name="radio-button-on" size={fontSizes.xxl} color="white" />
                                </Pressable>
                            </View>
                        </View>
                    </View>

                    <View style={styles.videoInfo}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Resolution</Text>
                            <Text style={styles.infoValue}>—</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>FPS</Text>
                            <Text style={styles.infoValue}>—</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Bitrate</Text>
                            <Text style={styles.infoValue}>--</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Connection</Text>
                            <Text style={[styles.infoValue, connectionStyle]}>{connectionLabel}</Text>
                        </View>
                        {ssid ? (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Wi‑Fi</Text>
                                <Text style={styles.infoValue} numberOfLines={1}>
                                    {ssid}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.cameraControls}>
                        <Text style={styles.label}>Camera Controls</Text>
                        <View style={styles.cameraButtonRow}>
                            <Pressable style={[styles.cameraButton, styles.cameraButtonSmall]}>
                                <Text style={styles.cameraButtonText}>Zoom -</Text>
                            </Pressable>
                            <Pressable style={[styles.cameraButton, styles.cameraButtonLarge]}>
                                <Text style={styles.cameraButtonText}>Reset</Text>
                            </Pressable>
                            <Pressable style={[styles.cameraButton, styles.cameraButtonSmall]}>
                                <Text style={styles.cameraButtonText}>Zoom +</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#05070a" },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + 80 },
    content: {
        paddingTop: spacing.xxxl + 20,
    },
    header: {
        marginBottom: spacing.xl,
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
    videoContainer: {
        minHeight: 320,
        borderRadius: radii.lg,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "#05070a",
        marginBottom: spacing.xl,
        position: "relative",
    },
    webView: {
        flex: 1,
        minHeight: 300,
        backgroundColor: "#000",
    },
    probeOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#05070a",
        zIndex: 2,
    },
    probeText: {
        marginTop: spacing.md,
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.5)",
    },
    videoPlaceholder: {
        flex: 1,
        minHeight: 300,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
    },
    videoIcon: {
        width: 72,
        height: 72,
        borderRadius: radii.xxl,
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.lg,
    },
    placeholderText: {
        fontSize: fontSizes.lg,
        fontWeight: "600",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1,
        marginBottom: spacing.sm,
        textAlign: "center",
    },
    placeholderSubtext: {
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.3)",
        textAlign: "center",
    },
    videoControls: {
        position: "absolute",
        bottom: spacing.lg,
        left: spacing.lg,
        right: spacing.lg,
    },
    controlRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: spacing.md,
    },
    controlButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
        alignItems: "center",
        justifyContent: "center",
    },
    videoInfo: {
        marginBottom: spacing.xl,
        padding: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: spacing.md,
    },
    infoLabel: {
        fontSize: fontSizes.xs,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.4)",
    },
    infoValue: {
        fontSize: fontSizes.sm,
        fontWeight: "600",
        color: "white",
        letterSpacing: 1,
        flexShrink: 1,
        marginLeft: spacing.md,
        textAlign: "right",
    },
    infoValueDisconnected: {
        color: "rgba(255,255,255,0.35)",
    },
    infoValueWarning: {
        color: "#ffb020",
    },
    infoValueConnected: {
        color: "#00f2ff",
    },
    label: { fontSize: fontSizes.xs, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: spacing.md },
    cameraControls: {
        marginBottom: spacing.xxxl,
        marginTop: spacing.lg,
    },
    cameraButtonRow: {
        flexDirection: "row",
        gap: spacing.md,
    },
    cameraButton: {
        minHeight: 52,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
        alignItems: "center",
        justifyContent: "center",
    },
    cameraButtonSmall: {
        flex: 1,
    },
    cameraButtonLarge: {
        flex: 2,
    },
    cameraButtonText: {
        fontSize: fontSizes.sm,
        fontWeight: "700",
        letterSpacing: 1,
        color: "rgba(255,255,255,0.7)",
    },
});
