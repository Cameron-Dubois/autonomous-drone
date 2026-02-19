import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function Video() {
    return (
        <View style={styles.root}>
            <View style={styles.panel}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Live Video</Text>
                    <Text style={styles.subtitle}>Real-time drone camera feed</Text>
                </View>

                {/* Video Container */}
                <View style={styles.videoContainer}>
                    <View style={styles.videoPlaceholder}>
                        <View style={styles.videoIcon}>
                            <Text style={styles.videoIconText}>📹</Text>
                        </View>
                        <Text style={styles.placeholderText}>Video Stream</Text>
                        <Text style={styles.placeholderSubtext}>Connect to drone to view live feed</Text>
                    </View>

                    {/* Video Controls Overlay */}
                    <View style={styles.videoControls}>
                        <View style={styles.controlRow}>
                            <View style={styles.controlButton}>
                                <Text style={styles.controlButtonText}>⏸</Text>
                            </View>
                            <View style={styles.controlButton}>
                                <Text style={styles.controlButtonText}>⏹</Text>
                            </View>
                            <View style={styles.controlButton}>
                                <Text style={styles.controlButtonText}>⏺</Text>
                            </View>
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
                        <View style={[styles.cameraButton, styles.cameraButtonSmall]}>
                            <Text style={styles.cameraButtonText}>Zoom -</Text>
                        </View>
                        <View style={[styles.cameraButton, styles.cameraButtonLarge]}>
                            <Text style={styles.cameraButtonText}>Reset</Text>
                        </View>
                        <View style={[styles.cameraButton, styles.cameraButtonSmall]}>
                            <Text style={styles.cameraButtonText}>Zoom +</Text>
                        </View>
                    </View>
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
        paddingHorizontal: 32,
    },
    header: {
        marginBottom: 24,
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
    videoContainer: {
        height: 400,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "#05070a",
        marginBottom: 24,
        position: "relative",
    },
    videoPlaceholder: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    videoIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    videoIconText: {
        fontSize: 40,
    },
    placeholderText: {
        fontSize: 16,
        fontWeight: "600",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1,
        marginBottom: 8,
    },
    placeholderSubtext: {
        fontSize: 12,
        color: "rgba(255,255,255,0.3)",
    },
    videoControls: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
    },
    controlRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
    },
    controlButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
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
        marginBottom: 24,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    infoLabel: {
        fontSize: 10,
        letterSpacing: 1,
        color: "rgba(255,255,255,0.4)",
    },
    infoValue: {
        fontSize: 12,
        fontWeight: "600",
        color: "white",
        letterSpacing: 1,
    },
    infoValueDisconnected: {
        color: "rgba(255,255,255,0.3)",
    },
    label: { fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 12 },
    cameraControls: {
        marginBottom: 40,
    },
    cameraButtonRow: {
        flexDirection: "row",
        gap: 12,
    },
    cameraButton: {
        height: 60,
        borderRadius: 16,
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
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1,
        color: "rgba(255,255,255,0.7)",
    },
});

