import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { User } from "../types";
import { profilePictureUrl } from "../lib/media";
import { colors } from "../lib/theme";

export function ProfilePicture({ user, size = 52 }: { user: Pick<User, "username" | "profilePicture">; size?: number }) {
  const [open, setOpen] = useState(false), uri = profilePictureUrl(user.profilePicture);
  const picture = uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.text, fontSize: size * .42, fontWeight: "800" }}>{user.username[0]?.toUpperCase()}</Text></View>;
  return <>
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open ${user.username}'s profile picture`} onPress={() => setOpen(true)}>{picture}</Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <Text style={styles.name}>{user.username}</Text>
        {uri ? <Image source={{ uri }} resizeMode="contain" style={styles.large} /> : <View style={[styles.large, styles.fallback]}><Text style={styles.initial}>{user.username[0]?.toUpperCase()}</Text></View>}
        <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityRole="button" accessibilityLabel="Close profile picture"><Ionicons name="close" size={28} color={colors.text} /></Pressable>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center", padding: 24 },
  large: { width: "100%", aspectRatio: 1, maxWidth: 430, borderRadius: 22 }, fallback: { backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" },
  initial: { color: colors.text, fontSize: 110, fontWeight: "900" }, name: { color: colors.text, fontWeight: "900", fontSize: 22, marginBottom: 18 },
  close: { position: "absolute", top: 50, right: 20, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }
});
