import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, OwnerBadge, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/lib/theme";
import { profilePictureUrl } from "../../src/lib/media";
import { uploadForm } from "../../src/lib/api";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

const items = [
  ["Music Requests", "musical-notes-outline", "/profile/requests"], ["Bug Reports", "bug-outline", "/profile/bugs"], ["Update Ideas", "bulb-outline", "/profile/update-ideas"], ["Update Feed", "newspaper-outline", "/profile/updates"], ["Notifications", "notifications-outline", "/profile/notifications"]
] as const;
export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const [uploading, setUploading] = useState(false), pictureBusy = useRef(false);
  if (!user) return null;
  const changePicture = async () => {
    if (pictureBusy.current) return;
    pictureBusy.current = true; setUploading(true);
    try {
      // Android uses the system photo picker; broad media access is not needed.
      if (Platform.OS === "ios") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { Alert.alert("Photo permission needed", "Allow photo access in device settings to choose a profile picture."); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .85 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const imageFile = new File(asset.uri);
      if (imageFile.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      const form = new FormData();
      // Expo fetch requires a real File/Blob, not a legacy { uri, name, type } object.
      form.append("file", imageFile);
      await uploadForm("/api/profile/me/picture", form);
      await refresh();
    } catch (e) { Alert.alert("Could not update photo", e instanceof Error ? e.message : "Try again"); }
    finally { pictureBusy.current = false; setUploading(false); }
  };
  const canStaff = !!user.isOwner || user.rank === "Admin" || user.rank === "Developer";
  const canUpload = !!user.isOwner || user.rank === "Moderator" || canStaff;
  const menu = [...items, ...(canStaff ? [["Staff Portal", "shield-checkmark-outline", "/profile/staff"]] as const : []), ...(canUpload ? [["Music Manager", "create-outline", "/profile/music-manager"], ["Music Uploader", "cloud-upload-outline", "/profile/uploader"]] as const : []), ...(user.isOwner || user.rank === "Developer" ? [["Dev Portal", "code-slash-outline", "/profile/developer"]] as const : [])];
  return <Screen><Title>Profile</Title><View style={styles.header}><Pressable disabled={uploading} accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={() => void changePicture()}>{user.profilePicture ? <Image source={{ uri: profilePictureUrl(user.profilePicture) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={{ color: colors.text, fontSize: 30, fontWeight: "900" }}>{user.username[0]?.toUpperCase()}</Text></View>}<View style={styles.editPhoto}>{uploading ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={14} color={colors.accentText} />}</View></Pressable><View style={{ flex: 1 }}><Text style={styles.name}>{user.username}</Text><View style={[ui.row, { gap: 7, flexWrap: "wrap" }]}>{user.isOwner ? <OwnerBadge /> : null}<RankBadge rank={user.rank} /></View></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Copy ID" onPress={() => { void Clipboard.setStringAsync(user.id).then(() => Alert.alert("Copied", "ID copied to clipboard.")); }}><Card><View style={[ui.row, { justifyContent: "space-between" }]}><View><Text style={ui.muted}>ID</Text><Text selectable style={[ui.body, { fontFamily: "monospace", marginTop: 4 }]}>{user.id}</Text></View><Ionicons name="copy-outline" size={22} color={colors.accent} /></View></Card></Pressable>
    <Text style={ui.section}>Account</Text>{menu.map(([label, icon, href]) => <Pressable key={href} onPress={() => router.push(href as any)} style={styles.menu}><View style={[ui.row, { gap: 12 }]}><Ionicons name={icon} size={22} color={colors.text} /><Text style={ui.body}>{label}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>)}
    <View style={{ marginTop: 24 }}><Button title="Sign out" tone="dark" onPress={() => { Alert.alert("Sign out?", undefined, [{ text: "Cancel" }, { text: "Sign out", style: "destructive", onPress: () => void logout() }]); }} /></View>
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 }, avatar: { width: 78, height: 78, borderRadius: 39 }, avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.raised }, editPhoto: { position: "absolute", right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }, name: { color: colors.text, fontSize: 25, fontWeight: "900", marginBottom: 8 }, menu: { minHeight: 56, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
