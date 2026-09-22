import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { colors } from "../lib/theme";
import { profilePictureUrl } from "../lib/media";
import type { Playlist } from "../types";
import { ui } from "./UI";
import { F4WEAlert as Alert } from "./F4WEAlert";

export function PlaylistRow({ playlist, onOpen, onSaved }: { playlist: Playlist; onOpen?(): void; onSaved?(): void }) {
  const { user } = useAuth(), library = useLibrary(); const owned = playlist.creatorId === user?.id;
  const saved = library.playlists.find(item => item.id === playlist.id)?.saved ?? playlist.saved;
  return <View style={[ui.row, { gap: 12, paddingVertical: 12 }]}>
    <Pressable accessibilityRole="button" onPress={() => { onOpen?.(); router.push({ pathname: "/playlist/[id]", params: { id: playlist.id } }); }} style={[ui.row, { flex: 1, gap: 12 }]}>
      {playlist.artworkUrl ? <Image source={{ uri: profilePictureUrl(playlist.artworkUrl) }} style={{ width: 54, height: 54, borderRadius: 10 }} /> : <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}><Ionicons name="list" color={colors.accent} size={26} /></View>}
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={[ui.body, { fontWeight: "800" }]}>{playlist.name}</Text><Text style={ui.muted}>Playlist • {playlist.creator.username} • {playlist.trackCount} songs</Text></View>
    </Pressable>
    {!owned ? <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Remove playlist from library" : "Save playlist to library"} style={{ padding: 10 }} onPress={() => { void library.toggleSaved({ ...playlist, saved }).then(() => onSaved?.()).catch(e => Alert.alert("Could not save playlist", e.message)); }}><Ionicons name={saved ? "checkmark-circle" : "add-circle-outline"} size={28} color={colors.accent} /></Pressable> : null}
  </View>;
}
