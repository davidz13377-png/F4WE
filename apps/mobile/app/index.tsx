import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";

export default function Index() { const { user, loading } = useAuth(); if (loading) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.accent} /></View>; return <Redirect href={user ? "/(tabs)" : "/login"} />; }
