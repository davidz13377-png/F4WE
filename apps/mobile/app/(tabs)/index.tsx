import { Ionicons } from "@expo/vector-icons";
import { useActiveTrack } from "react-native-track-player";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SongRow } from "../../src/components/SongRow";
import { Card, Empty, OwnerBadge, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useLibrary } from "../../src/context/LibraryContext";
import { api } from "../../src/lib/api";
import { colors, rankColor } from "../../src/lib/theme";
import type { RotationSong, User } from "../../src/types";
import { ProfilePicture } from "../../src/components/ProfilePicture";

function AnimatedWordmark() {
  const [text, setText] = useState("F");
  const [cursor, setCursor] = useState(true);
  useFocusEffect(useCallback(() => {
    setText("F"); setCursor(true);
    const timers = [
      setTimeout(() => setText("F4"), 150), setTimeout(() => setText("F4W"), 300), setTimeout(() => setText("F4WE"), 450),
      setTimeout(() => setCursor(false), 620), setTimeout(() => setCursor(true), 790),
      setTimeout(() => setCursor(false), 960)
    ];
    return () => timers.forEach(clearTimeout);
  }, []));
  return <Text accessibilityLabel="F4WE" style={styles.logo}>{text}{cursor ? <Text style={styles.cursor}>|</Text> : null}</Text>;
}

export default function Home() {
  const library = useLibrary();
  const activeTrack = useActiveTrack();
  const [songs, setSongs] = useState<RotationSong[]>([]), [staff, setStaff] = useState<User[]>([]), [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const [tracks, team] = await Promise.all([api<RotationSong[]>("/api/music/rotation"), api<User[]>("/api/profile/staff-team"), library.refresh()]); setSongs(tracks); setStaff(team); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not refresh Home"); }
  }, [library.refresh]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Screen scroll={false}><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: activeTrack ? 76 : 20 }}>
    <View style={[ui.row, { justifyContent: "space-between", marginBottom: 20 }]}>
      <AnimatedWordmark />
      <Pressable accessibilityRole="button" accessibilityLabel="Open updates" onPress={() => router.push("/profile/updates")} style={styles.updates}>
        <Ionicons name="newspaper-outline" size={17} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "800" }}>Updates</Text>
      </Pressable>
    </View><Title subtitle="Your music. Your community.">Good to see you</Title>
    {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    <Text style={ui.section}>Your Rotation This Week</Text>
    {songs.length ? songs.map(song => <SongRow key={song.id} song={song} queue={songs} />) : <Empty label="Play some music to build your weekly rotation" />}
    <Text style={ui.section}>Staff Team</Text>
    {staff.length ? staff.map(member => <Card key={member.id}><View style={[ui.row, { gap: 14 }]}>
      <ProfilePicture user={member} size={52} />
      <View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "500", fontSize: 17, marginBottom: 7 }]}>{member.username}</Text><View style={[ui.row, { gap: 6, flexWrap: "wrap" }]}>{member.isOwner ? <OwnerBadge /> : null}<RankBadge rank={member.rank} /></View></View>
      <Ionicons name={member.rank === "Developer" ? "code-slash" : "shield-checkmark"} size={24} color={member.isOwner ? colors.gold : rankColor[member.rank]} />
    </View></Card>) : <Empty label="No staff members yet" />}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({
  logo: { color: colors.accent, fontSize: 25, fontWeight: "900", letterSpacing: 3, minWidth: 105 },
  cursor: { color: colors.accent, fontWeight: "400" },
  updates: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 99, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border },
});
