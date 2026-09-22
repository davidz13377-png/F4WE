import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/lib/theme";

export default function TabsLayout() {
  const { user } = useAuth(); if (!user) return <Redirect href="/login" />;
  return <><Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 62 }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 5 }, tabBarIcon: ({ color, size }) => <Ionicons name={({ index: "home", search: "search", library: "library", profile: "person" } as any)[route.name] || "ellipse"} size={size} color={color} /> })}>
    <Tabs.Screen name="index" options={{ title: "Home" }} /><Tabs.Screen name="search" options={{ title: "Search" }} /><Tabs.Screen name="library" options={{ title: "Library" }} /><Tabs.Screen name="profile" options={{ title: "Profile" }} />
  </Tabs></>;
}
