import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Input, OwnerBadge, RankBadge, Screen, Title, ui } from "../../src/components/UI";
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
  const [bannerBusy, setBannerBusy] = useState(false), [nameOpen, setNameOpen] = useState(false), [username, setUsername] = useState(user?.username ?? ""), [nameBusy, setNameBusy] = useState(false);
  const [stats, setStats] = useState<{ totalSeconds: number; playCount: number } | null>(null), [recap, setRecap] = useState<Recap | null>(null), [statsBusy, setStatsBusy] = useState(false);
  const [activeRequestCount, setActiveRequestCount] = useState(0);
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
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      await uploadFile("/api/profile/me/picture", { uri: asset.uri, name: asset.fileName || "profile-picture.jpg", type: asset.mimeType || "image/jpeg", size: asset.fileSize });
      await refresh();
    } catch (e) { Alert.alert("Could not update photo", e instanceof Error ? e.message : "Try again"); }
    finally { pictureBusy.current = false; setUploading(false); }
  };
  const changeBanner = async () => {
    if (bannerBusy) return; setBannerBusy(true);
    try {
      if (Platform.OS === "ios") { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert("Photo permission needed", "Allow photo access in device settings."); }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0]; if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      await uploadFile("/api/profile/me/banner", { uri: asset.uri, name: asset.fileName || "profile-banner.jpg", type: asset.mimeType || "image/jpeg", size: asset.fileSize });
      await refresh();
    } catch (e) { Alert.alert("Could not update banner", e instanceof Error ? e.message : "Try again"); } finally { setBannerBusy(false); }
  };
  const saveUsername = async () => {
    const value = username.trim(); if (value.length < 3 || nameBusy) return Alert.alert("Invalid username", "Use at least 3 characters.");
    setNameBusy(true); try { await api("/api/profile/me", { method: "PATCH", body: JSON.stringify({ username: value }) }); await refresh(); setNameOpen(false); }
    catch (e) { Alert.alert("Could not change username", e instanceof Error ? e.message : "Try again"); } finally { setNameBusy(false); }
  };
  const canStaff = !!user.isOwner || user.rank === "Admin" || user.rank === "Developer";
  useFocusEffect(useCallback(() => {
    if (!canStaff) return;
    let live = true;
    void api<{ count: number }>("/api/profile/staff/requests/active-count").then(value => { if (live) setActiveRequestCount(value.count); }).catch(() => undefined);
    return () => { live = false; };
  }, [canStaff]));
  const canUpload = !!user.isOwner || user.rank === "Moderator" || canStaff;
  const menu = [["F4WE Shop", "bag-handle-outline", "/profile/shop"], ...items, ...(canStaff ? [["Staff Portal", "shield-checkmark-outline", "/profile/staff"]] as const : []), ...(canUpload ? [["Music Manager", "create-outline", "/profile/music-manager"], ["Music Uploader", "cloud-upload-outline", "/profile/uploader"]] as const : []), ...(user.isOwner || user.rank === "Developer" ? [["Dev Portal", "code-slash-outline", "/profile/developer"]] as const : []), ...(user.isOwner ? [["Owner Portal", "diamond-outline", "/profile/owner"]] as const : [])] as const;
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
  return <Screen><Title>Profile</Title><View style={styles.profileCard}><Pressable disabled={bannerBusy} onPress={() => void changeBanner()} style={styles.banner}>{user.bannerUrl ? <Image source={{ uri: profilePictureUrl(user.bannerUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}<View style={styles.bannerShade} /><View style={styles.bannerEdit}>{bannerBusy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="pencil" size={17} color={colors.text} />}</View></Pressable><View style={styles.profileBody}><Pressable disabled={uploading} accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={() => void changePicture()} style={styles.avatarWrap}>{user.profilePicture ? <Image source={{ uri: profilePictureUrl(user.profilePicture) }} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={{ color: colors.text, fontSize: 30, fontWeight: "900" }}>{user.username[0]?.toUpperCase()}</Text></View>}{user.profileDesignUrl ? <Image source={{ uri: profilePictureUrl(user.profileDesignUrl) }} style={styles.profileFrame} contentFit="contain" /> : null}<View style={styles.editPhoto}>{uploading ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={14} color={colors.accentText} />}</View></Pressable><View style={{ flex: 1, paddingTop: 10 }}><View style={[ui.row, { gap: 8 }]}><Text style={styles.name}>{user.username}</Text><Pressable onPress={() => { setUsername(user.username); setNameOpen(true); }}><Ionicons name="pencil" size={18} color={colors.accent} /></Pressable></View><View style={[ui.row, { gap: 7, flexWrap: "wrap" }]}>{user.isOwner ? <OwnerBadge /> : null}<RankBadge rank={user.rank} /></View></View></View></View>
    <Card><View style={[ui.row, { justifyContent: "space-between" }]}><View><Text style={ui.muted}>F4WE COINS</Text><Text style={styles.coins}>{user.coins ?? 0}</Text></View><Ionicons name="diamond" size={32} color={colors.softRed} /></View></Card>
    <Pressable accessibilityRole="button" accessibilityLabel="Copy ID" onPress={() => { void Clipboard.setStringAsync(user.id).then(() => Alert.alert("Copied", "ID copied to clipboard.")); }}><Card><View style={[ui.row, { justifyContent: "space-between" }]}><View><Text style={ui.muted}>ID</Text><Text selectable style={[ui.body, { fontFamily: "monospace", marginTop: 4 }]}>{user.id}</Text></View><Ionicons name="copy-outline" size={22} color={colors.accent} /></View></Card></Pressable>
    <Button title="Show my listening stats" icon="stats-chart" tone="dark" loading={statsBusy} onPress={() => void showListeningStats()} />
    {stats && recap ? <Card><View style={{ alignItems: "center", paddingVertical: 4 }}><Ionicons name="headset" size={30} color={colors.softRed} /><Text style={{ color: colors.softRed, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 8 }}>TOTAL LISTENING TIME</Text><Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 7 }}>{fullDuration(stats.totalSeconds)}</Text><Text style={[ui.muted, { marginTop: 5 }]}>{stats.playCount} listening sessions</Text></View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} /><Text style={[ui.section, { marginTop: 0 }]}>{recap.year} Recap</Text><Text style={[ui.muted, { marginBottom: 10 }]}>{fullDuration(recap.totalSeconds)} this year</Text>
      {recap.topSongs.length ? recap.topSongs.map((song, index) => <View key={song.id} style={[ui.row, { gap: 10, paddingVertical: 7 }]}><Text style={{ color: index === 0 ? colors.softRed : colors.muted, fontWeight: "900", width: 22 }}>{index + 1}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={[ui.body, { fontWeight: "800" }]}>{song.title}</Text><Text style={ui.muted}>{song.artist || "Unknown artist"}</Text></View><Text style={[ui.muted, { fontVariant: ["tabular-nums"] }]}>{fullDuration(song.listenedSeconds)}</Text></View>) : <Text style={ui.muted}>Listen to music to build this year's Top 5.</Text>}
    </Card> : null}
    <Text style={ui.section}>Account</Text>{menu.map(([label, icon, href]) => <Pressable key={href} onPress={() => router.push(href as any)} style={styles.menu}><View style={[ui.row, { gap: 12 }]}><Ionicons name={icon} size={22} color={colors.text} /><Text style={ui.body}>{label}</Text>{href === "/profile/staff" && activeRequestCount > 0 ? <View style={styles.requestBadge}><Text style={styles.requestBadgeText}>{activeRequestCount > 99 ? "99+" : activeRequestCount}</Text></View> : null}</View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>)}
    <View style={{ marginTop: 24 }}><Button title="Sign out" tone="dark" onPress={() => { Alert.alert("Sign out?", undefined, [{ text: "Cancel" }, { text: "Sign out", style: "destructive", onPress: () => void logout() }]); }} /></View>
    <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => setNameOpen(false)}><View style={styles.modalBackdrop}><View style={styles.nameModal}><Text style={[ui.section, { marginTop: 0 }]}>Change username</Text><Text style={[ui.muted, { marginBottom: 12 }]}>This will also be your new login username. Usernames are unique regardless of uppercase/lowercase letters.</Text><Input value={username} onChangeText={setUsername} maxLength={32} autoCapitalize="none" /><Button title="Save username" loading={nameBusy} onPress={() => void saveUsername()} /><View style={{ height: 8 }} /><Button title="Cancel" tone="dark" onPress={() => setNameOpen(false)} /></View></View></Modal>
  </Screen>;
}
const styles = StyleSheet.create({ profileCard: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 14 }, banner: { height: 130, backgroundColor: "#3A1117" }, bannerShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#00000020" }, bannerEdit: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "#000A", alignItems: "center", justifyContent: "center" }, profileBody: { minHeight: 104, flexDirection: "row", alignItems: "flex-start", gap: 18, paddingHorizontal: 18, paddingBottom: 16 }, avatarWrap: { width: 102, height: 102, marginTop: -42, alignItems: "center", justifyContent: "center" }, avatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: colors.surface }, profileFrame: { position: "absolute", width: 108, height: 108 }, avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.raised }, editPhoto: { position: "absolute", right: 3, bottom: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }, name: { color: colors.text, fontSize: 25, fontWeight: "900", marginBottom: 8, flexShrink: 1 }, coins: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 3 }, modalBackdrop: { flex: 1, backgroundColor: "#000A", justifyContent: "center", padding: 22 }, nameModal: { backgroundColor: colors.surface, padding: 20, borderRadius: 22 }, menu: { minHeight: 56, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, requestBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: colors.softRed, alignItems: "center", justifyContent: "center" }, requestBadgeText: { color: colors.white, fontSize: 11, fontWeight: "900" } });
