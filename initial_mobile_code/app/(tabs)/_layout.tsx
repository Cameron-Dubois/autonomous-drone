import { Tabs } from "expo-router";

export default function TabLayout() {
    return (
        <Tabs>
            <Tabs.Screen name="index" options={{ title: "Home", headerShown: false }} />
            <Tabs.Screen name="control" options={{ title: "Control", headerShown: false }} />
            <Tabs.Screen name="connect" options={{ title: "Connect", headerShown: false }} />
            <Tabs.Screen name="video" options={{ title: "Video", headerShown: false }} />
        </Tabs>
    );
}
