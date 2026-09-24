import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, OwnerBadge, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/lib/theme";
import { profilePictureUrl } from "../../src/lib/media";
import { api, uploadFile } from "../../src/lib/api";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { fullDuration } from "../../src/lib/time";

type Recap = { year: number; totalSeconds: number; playCount: number; topSongs: { id: string; title: string; artist?: string | null; listenedSeconds: number; playCount: number }[] };

const items = [
  ["Music Requests", "musical-notes-outline", "/profile/requests"], ["Bug Reports", "bug-outline", "/profile/bugs"], ["Update Ideas", "bulb-outline", "/profile/update-ideas"], ["Update Feed", "newspaper-outline", "/profile/updates"], ["Notifications", "notifications-outline", "/profile/notifications"]
] as const;
export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const [uploading, setUploading] = useState(false), pictureBusy = useRef(false);
  const [stats, setStats] = useState<{ totalSeconds: number; playCount: number } | null>(null), [recap, setRecap] = useState<Recap | null>(null), [statsBusy, setStatsBusy] = useState(false);
  const hideStats = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hideStats.current) clearTimeout(hideStats.current); }, []);
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
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      await uploadFile("/api/profile/me/picture", { uri: asset.uri, name: asset.fileName || "profile-picture.jpg", type: asset.mimeType || "image/jpeg", size: asset.fileSize });
      await refresh();
    } catch (e) { Alert.alert("Could not update photo", e instanceof Error ? e.message : "Try again"); }
    finally { pictureBusy.current = false; setUploading(false); }
  };
  const canStaff = !!user.isOwner || user.rank === "Admin" || user.rank === "Developer";
  const canUpload = !!user.isOwner || user.rank === "Moderator" || canStaff;
  const menu = [...items, ...(canStaff ? [["Staff Portal", "shield-checkmark-outline", "/profile/staff"]] as const : []), ...(canUpload ? [["Music Manager", "create-outline", "/profile/music-manager"], ["Music Uploader", "cloud-upload-outline", "/profile/uploader"]] as const : []), ...(user.isOwner || user.rank === "Developer" ? [["Dev Portal", "code-slash-outline", "/profile/developer"]] as const : [])];
  const showListeningStats = async () => {
    if (statsBusy) return;
    setStatsBusy(true);
    try {
      const [all, year] = await Promise.all([api<{ totalSeconds: number; playCount: number }>("/api/profile/me/listening-stats"), api<Recap>("/api/profile/me/recap")]);
      setStats(all); setRecap(year);
      if (hideStats.current) clearTimeout(hideStats.current);
      hideStats.current = setTimeout(() => { setStats(null); setRecap(null); }, 10_000);
    } catch (e) { Alert.alert("Could not load listening stats", e instanceof Error ? e.message : "Try again"); }
    finally { setStatsBusy(false); }
  };
  return <Screen><Title>Profile</Title><View style={styles.header}><Pressable disabled={uploading} accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={() => void changePicture()}>{user.profilePicture ? <Image source={{ uri: profilePictureUrl(user.profilePicture) }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={{ color: colors.text, fontSize: 30, fontWeight: "900" }}>{user.username[0]?.toUpperCase()}</Text></View>}<View style={styles.editPhoto}>{uploading ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={14} color={colors.accentText} />}</View></Pressable><View style={{ flex: 1 }}><Text style={styles.name}>{user.username}</Text><View style={[ui.row, { gap: 7, flexWrap: "wrap" }]}>{user.isOwner ? <OwnerBadge /> : null}<RankBadge rank={user.rank} /></View></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Copy ID" onPress={() => { void Clipboard.setStringAsync(user.id).then(() => Alert.alert("Copied", "ID copied to clipboard.")); }}><Card><View style={[ui.row, { justifyContent: "space-between" }]}><View><Text style={ui.muted}>ID</Text><Text selectable style={[ui.body, { fontFamily: "monospace", marginTop: 4 }]}>{user.id}</Text></View><Ionicons name="copy-outline" size={22} color={colors.accent} /></View></Card></Pressable>
    <Button title="Show my listening stats" icon="stats-chart" tone="dark" loading={statsBusy} onPress={() => void showListeningStats()} />
    {stats && recap ? <Card><View style={{ alignItems: "center", paddingVertical: 4 }}><Ionicons name="headset" size={30} color={colors.softRed} /><Text style={{ color: colors.softRed, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 8 }}>TOTAL LISTENING TIME</Text><Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 7 }}>{fullDuration(stats.totalSeconds)}</Text><Text style={[ui.muted, { marginTop: 5 }]}>{stats.playCount} listening sessions</Text></View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} /><Text style={[ui.section, { marginTop: 0 }]}>{recap.year} Recap</Text><Text style={[ui.muted, { marginBottom: 10 }]}>{fullDuration(recap.totalSeconds)} this year</Text>
      {recap.topSongs.length ? recap.topSongs.map((song, index) => <View key={song.id} style={[ui.row, { gap: 10, paddingVertical: 7 }]}><Text style={{ color: index === 0 ? colors.softRed : colors.muted, fontWeight: "900", width: 22 }}>{index + 1}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={[ui.body, { fontWeight: "800" }]}>{song.title}</Text><Text style={ui.muted}>{song.artist || "Unknown artist"}</Text></View><Text style={[ui.muted, { fontVariant: ["tabular-nums"] }]}>{fullDuration(song.listenedSeconds)}</Text></View>) : <Text style={ui.muted}>Listen to music to build this year's Top 5.</Text>}
    </Card> : null}
    <Text style={ui.section}>Account</Text>{menu.map(([label, icon, href]) => <Pressable key={href} onPress={() => router.push(href as any)} style={styles.menu}><View style={[ui.row, { gap: 12 }]}><Ionicons name={icon} size={22} color={colors.text} /><Text style={ui.body}>{label}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>)}
    <View style={{ marginTop: 24 }}><Button title="Sign out" tone="dark" onPress={() => { Alert.alert("Sign out?", undefined, [{ text: "Cancel" }, { text: "Sign out", style: "destructive", onPress: () => void logout() }]); }} /></View>
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 }, avatar: { width: 78, height: 78, borderRadius: 39 }, avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.raised }, editPhoto: { position: "absolute", right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }, name: { color: colors.text, fontSize: 25, fontWeight: "900", marginBottom: 8 }, menu: { minHeight: 56, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
