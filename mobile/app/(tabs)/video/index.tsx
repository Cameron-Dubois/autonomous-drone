import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, fontSizes, radii, getPanelDimensions } from "../../../src/theme/layout";

export default function Video() {
    const { width: screenWidth } = useWindowDimensions();
    const { contentPadding } = getPanelDimensions(screenWidth, 0);

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.content, { paddingHorizontal: contentPadding }]}>
                    {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Live Video</Text>
                    <Text style={styles.subtitle}>Real-time drone camera feed</Text>
                </View>

                {/* Video Container */}
                <View style={styles.videoContainer}>
                    <View style={styles.videoPlaceholder}>
                        <View style={styles.videoIcon}>
                            <Ionicons name="videocam" size={fontSizes.xxl * 2} color="rgba(255,255,255,0.4)" />
                        </View>
                        <Text style={styles.placeholderText}>Video Stream</Text>
                        <Text style={styles.placeholderSubtext}>Connect to drone to view live feed</Text>
                    </View>

                    {/* Video Controls Overlay */}
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

                {/* Video Info */}
                <View style={styles.videoInfo}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Resolution</Text>
                        <Text style={styles.infoValue}>1080p</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>FPS</Text>
                        <Text style={styles.infoValue}>30</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Bitrate</Text>
                        <Text style={styles.infoValue}>--</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Connection</Text>
                        <Text style={[styles.infoValue, styles.infoValueDisconnected]}>Disconnected</Text>
                    </View>
                </View>

                {/* Camera Controls */}
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
    videoPlaceholder: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
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
    videoIconText: {
        fontSize: 40,
    },
    placeholderText: {
        fontSize: fontSizes.lg,
        fontWeight: "600",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1,
        marginBottom: spacing.sm,
    },
    placeholderSubtext: {
        fontSize: fontSizes.sm,
        color: "rgba(255,255,255,0.3)",
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
    controlButtonText: {
        fontSize: 20,
        color: "white",
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
    },
    infoValueDisconnected: {
        color: "rgba(255,255,255,0.3)",
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
