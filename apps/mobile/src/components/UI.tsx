import { Ionicons } from "@expo/vector-icons";
import { useActiveTrack } from "react-native-track-player";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, rankColor } from "../lib/theme";
import type { Rank } from "../types";

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const activeTrack = useActiveTrack();
  const contentStyle = [styles.content, { paddingBottom: scroll ? (activeTrack ? 140 : 24) : 0 }];
  const content = scroll ? <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={contentStyle}>{children}</View>;
  return <SafeAreaView style={styles.screen} edges={["top"]}>{content}</SafeAreaView>;
}
export function Title({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  return <View style={{ marginBottom: 22 }}><Text style={styles.title}>{children}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}
export function Input(props: TextInputProps) { return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />; }
export function Button({ title, onPress, loading, tone = "green", icon }: { title: string; onPress(): void; loading?: boolean; tone?: "green" | "dark" | "red"; icon?: keyof typeof Ionicons.glyphMap }) {
  const foreground = tone === "green" ? colors.accentText : colors.text;
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={loading} style={({ pressed }) => [styles.button, { backgroundColor: tone === "green" ? colors.accent : tone === "red" ? colors.red : colors.raised, opacity: pressed || loading ? .7 : 1 }]}>
    {loading ? <ActivityIndicator color={foreground} /> : <>{icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}<Text style={[styles.buttonText, { color: foreground }]}>{title}</Text></>}
  </Pressable>;
}
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function RankBadge({ rank }: { rank: Rank }) { return <View style={[styles.badge, { borderColor: rankColor[rank] }]}><View style={[styles.dot, { backgroundColor: rankColor[rank] }]} /><Text style={{ color: rankColor[rank], fontWeight: "800", fontSize: 11 }}>{rank.toUpperCase()}</Text></View>; }
export function OwnerBadge() { return <View style={[styles.badge, { borderColor: colors.gold }]}><View style={[styles.dot, { backgroundColor: colors.gold }]} /><Text style={{ color: colors.gold, fontWeight: "800", fontSize: 11 }}>OWNER</Text></View>; }
export function Empty({ label }: { label: string }) { return <View style={styles.empty}><Ionicons name="musical-notes-outline" size={32} color={colors.muted} /><Text style={styles.subtitle}>{label}</Text></View>; }

export const ui = StyleSheet.create({
  label: { color: colors.text, fontWeight: "700", marginBottom: 8 }, body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13 }, row: { flexDirection: "row", alignItems: "center" }, section: { marginTop: 26, marginBottom: 12, color: colors.text, fontSize: 20, fontWeight: "800" }
});
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, padding: 20 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -1 }, subtitle: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.text, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12 },
  button: { minHeight: 50, borderRadius: 25, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, buttonText: { fontWeight: "800", fontSize: 15 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  badge: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }, dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 44, gap: 10 }
});
