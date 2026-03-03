import { Tabs } from "expo-router";

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
            <Tabs.Screen name="index" options={{ title: "Home" }} />
            <Tabs.Screen name="connect" options={{ title: "Connect" }} />
            <Tabs.Screen name="control" options={{ title: "Control" }} />
            <Tabs.Screen name="video" options={{ title: "Video" }} />
        </Tabs>
    );
}
