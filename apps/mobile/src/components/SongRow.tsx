import { Ionicons } from "@expo/vector-icons";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRef, useState } from "react";
import { colors } from "../lib/theme";
import type { Song } from "../types";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { F4WEAlert as Alert } from "./F4WEAlert";
import { api } from "../lib/api";

export function SongRow({ song, queue, queueControls = false, onPlay, onRemove }: { song: Song; queue?: Song[]; queueControls?: boolean; onPlay?: () => void; onRemove?: () => void }) {
  const player = usePlayer();
  const [info, setInfo] = useState<{ playCount: number; uploadDate: string; releaseDate?: string | null; duration?: number | null } | null>(null); const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const library = useLibrary(); const liked = library.isFavorite(song);
  const play = () => { onPlay?.(); void player.play(song, queue, { queueControls }); };
  const active = String(player.active?.id || "") === song.id;
  const showInfo = async () => { try { const value = await api<{ playCount: number; uploadDate: string; releaseDate?: string | null; duration?: number | null }>(`/api/music/${encodeURIComponent(song.id)}/info`); setInfo(value); if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setInfo(null), 10_000); } catch (e) { Alert.alert("Could not load song info", e instanceof Error ? e.message : "Try again"); } };
  return <View style={styles.row}>
    <Pressable onPress={play} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`}>
    {song.artworkUrl ? <Image source={{ uri: song.artworkUrl }} style={styles.art} /> : <View style={[styles.art, styles.fallback]}><Ionicons name="musical-note" size={22} color={colors.accent} /></View>}
    <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.title, active ? styles.activeTitle : null]}>{song.title}</Text><Text numberOfLines={1} style={styles.artist}>{song.artist || "Unknown artist"}</Text></View>
    </Pressable>
    <Pressable onPress={() => library.choosePlaylist(song)} style={styles.action} accessibilityRole="button" accessibilityLabel={`Add ${song.title} to playlist`}><Ionicons name="add-circle-outline" size={23} color={colors.muted} /></Pressable>
    <Pressable onPress={() => void library.toggleFavorite(song).catch(e => Alert.alert("Could not update favorite", e.message))} style={styles.action} accessibilityRole="button" accessibilityLabel={liked ? "Remove from favorites" : "Add to favorites"}><Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? colors.accent : colors.muted} /></Pressable>
    <Pressable onPress={play} style={styles.action} accessibilityRole="button" accessibilityLabel={`Play ${song.title}`}><Ionicons name="play-circle" size={32} color={colors.text} /></Pressable>
    <Pressable onPress={() => void showInfo()} style={styles.action} accessibilityRole="button" accessibilityLabel={`Information about ${song.title}`}><Ionicons name="information-circle-outline" size={22} color={colors.muted} /></Pressable>
    {onRemove ? <Pressable onPress={onRemove} style={styles.action} accessibilityRole="button" accessibilityLabel={`Remove ${song.title} from playlist`}><Ionicons name="close" size={22} color={colors.muted} /></Pressable> : null}
    <Modal visible={!!info} transparent animationType="fade" onRequestClose={() => setInfo(null)}><Pressable style={styles.infoBackdrop} onPress={() => setInfo(null)}><View style={styles.infoCard}><Text style={styles.infoEyebrow}>SONG INFO</Text><Text numberOfLines={2} style={styles.infoTitle}>{song.title}</Text><View style={styles.infoRow}><Text style={styles.infoValue}>{info?.playCount ?? 0}</Text><Text style={styles.infoLabel}>TOTAL PLAYS</Text></View><View style={styles.infoRow}><Text style={styles.infoValue}>{info ? new Date(info.releaseDate || info.uploadDate).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }) : ""}</Text><Text style={styles.infoLabel}>{info?.releaseDate ? "RELEASE DATE" : "ADDED TO F4WE"}</Text></View><Text style={styles.infoHint}>Closes automatically in 10 seconds • tap to close</Text></View></Pressable></Modal>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", paddingVertical: 9 }, action: { width: 36, height: 44, justifyContent: "center", alignItems: "center" }, art: { width: 46, height: 46, borderRadius: 10 }, fallback: { backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontWeight: "700", fontSize: 15 }, activeTitle: { color: colors.softRed }, artist: { color: colors.muted, fontSize: 13, marginTop: 3 }, infoBackdrop: { flex: 1, backgroundColor: "#000B", alignItems: "center", justifyContent: "center", padding: 24 }, infoCard: { width: "100%", maxWidth: 390, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 22 }, infoEyebrow: { color: colors.softRed, fontSize: 10, letterSpacing: 2, fontWeight: "900" }, infoTitle: { color: colors.text, fontSize: 24, fontWeight: "900", marginTop: 7, marginBottom: 18 }, infoRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 13 }, infoValue: { color: colors.text, fontSize: 17, fontWeight: "800" }, infoLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1.4, fontWeight: "900", marginTop: 3 }, infoHint: { color: colors.muted, fontSize: 11, marginTop: 8 } });
