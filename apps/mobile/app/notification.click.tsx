import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";

export default function NotificationPlayer() {
  const { user, loading } = useAuth();
  // A new token on each visit also reopens a previously dismissed player.
  const [openPlayer] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    {loading ? <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.accent} />
    </View> : user ? <Redirect href={{ pathname: "/(tabs)", params: { openPlayer } }} /> : <Redirect href="/login" />}
  </>;
}
