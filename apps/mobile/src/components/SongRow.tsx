import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";
import type { Song } from "../types";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { F4WEAlert as Alert } from "./F4WEAlert";

export function SongRow({ song, queue, queueControls = false, onPlay, onRemove }: { song: Song; queue?: Song[]; queueControls?: boolean; onPlay?: () => void; onRemove?: () => void }) {
  const player = usePlayer();
  const library = useLibrary(); const liked = library.isFavorite(song);
  const play = () => { onPlay?.(); void player.play(song, queue, { queueControls }); };
  const active = String(player.active?.id || "") === song.id;
  return <View style={styles.row}>
    <Pressable onPress={play} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`}>
    {song.artworkUrl ? <Image source={{ uri: song.artworkUrl }} style={styles.art} /> : <View style={[styles.art, styles.fallback]}><Ionicons name="musical-note" size={22} color={colors.accent} /></View>}
    <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.title, active ? styles.activeTitle : null]}>{song.title}</Text><Text numberOfLines={1} style={styles.artist}>{song.artist || "Unknown artist"}</Text></View>
    </Pressable>
    <Pressable onPress={() => library.choosePlaylist(song)} style={styles.action} accessibilityRole="button" accessibilityLabel={`Add ${song.title} to playlist`}><Ionicons name="add-circle-outline" size={23} color={colors.muted} /></Pressable>
    <Pressable onPress={() => void library.toggleFavorite(song).catch(e => Alert.alert("Could not update favorite", e.message))} style={styles.action} accessibilityRole="button" accessibilityLabel={liked ? "Remove from favorites" : "Add to favorites"}><Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? colors.accent : colors.muted} /></Pressable>
    <Pressable onPress={play} style={styles.action} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`}><Ionicons name="play-circle" size={32} color={colors.text} /></Pressable>
    {onRemove ? <Pressable onPress={onRemove} style={styles.action} accessibilityRole="button" accessibilityLabel={`Remove ${song.title} from playlist`}><Ionicons name="close" size={22} color={colors.muted} /></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", paddingVertical: 9 }, action: { width: 40, height: 44, justifyContent: "center", alignItems: "center" }, art: { width: 46, height: 46, borderRadius: 10 }, fallback: { backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontWeight: "700", fontSize: 15 }, activeTitle: { color: colors.softRed }, artist: { color: colors.muted, fontSize: 13, marginTop: 3 } });
