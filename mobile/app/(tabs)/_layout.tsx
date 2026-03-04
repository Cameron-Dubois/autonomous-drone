import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarStyle: { backgroundColor: "#0b1020", borderTopColor: "rgba(255,255,255,0.08)" },
                tabBarActiveTintColor: "#00f2ff",
                tabBarInactiveTintColor: "rgba(255,255,255,0.4)",
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Home",
                    tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size ?? 24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="connect"
                options={{
                    title: "Connect",
                    tabBarIcon: ({ color, size }) => <Ionicons name="bluetooth" size={size ?? 24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="control"
                options={{
                    title: "Control",
                    tabBarIcon: ({ color, size }) => <Ionicons name="game-controller" size={size ?? 24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="video"
                options={{
                    title: "Video",
                    tabBarIcon: ({ color, size }) => <Ionicons name="videocam" size={size ?? 24} color={color} />,
                }}
            />
        </Tabs>
    );
}
