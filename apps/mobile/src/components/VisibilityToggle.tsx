import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function VisibilityToggle({ value, onChange, disabled }: { value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <View style={[styles.wrap, disabled ? { opacity: .55 } : null]} accessibilityRole="radiogroup">
    <Pressable disabled={disabled} onPress={() => onChange(false)} style={[styles.option, !value ? styles.selected : null]} accessibilityRole="radio" accessibilityState={{ checked: !value }}>
      <Ionicons name="lock-closed" size={15} color={!value ? colors.background : colors.muted} /><Text style={[styles.text, !value ? styles.selectedText : null]}>Private</Text>
    </Pressable>
    <Pressable disabled={disabled} onPress={() => onChange(true)} style={[styles.option, value ? styles.selected : null]} accessibilityRole="radio" accessibilityState={{ checked: value }}>
      <Ionicons name="globe-outline" size={16} color={value ? colors.background : colors.muted} /><Text style={[styles.text, value ? styles.selectedText : null]}>Public</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", backgroundColor: colors.raised, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.border },
  option: { flex: 1, minHeight: 42, borderRadius: 12, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.text }, text: { color: colors.muted, fontSize: 13, fontWeight: "800" }, selectedText: { color: colors.background }
});
