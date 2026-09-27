import { useCallback, useRef, useState } from "react";
import { Redirect, Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Modal, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { SongRow } from "../../src/components/SongRow";
import { useAuth } from "../../src/context/AuthContext";
import { useLibrary } from "../../src/context/LibraryContext";
import { usePlayer } from "../../src/context/PlayerContext";
import { api, uploadFile } from "../../src/lib/api";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { profilePictureUrl } from "../../src/lib/media";
import { colors } from "../../src/lib/theme";
import type { PlaylistDetails } from "../../src/types";
import { VisibilityToggle } from "../../src/components/VisibilityToggle";
import { compactDuration } from "../../src/lib/time";

export default function PlaylistScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, loading: authLoading } = useAuth(), library = useLibrary(), player = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistDetails | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false), [playlistName, setPlaylistName] = useState("");
  const pictureBusy = useRef(false);
  const load = useCallback(async () => {
    if (!user || !id) return; setLoading(true); setError("");
    try { setPlaylist(await api<PlaylistDetails>("/api/playlists/" + encodeURIComponent(id))); }
    catch (e) { setPlaylist(null); setError(e instanceof Error ? e.message : "Could not open playlist"); }
    finally { setLoading(false); }
  }, [id, user?.id]);
  useFocusEffect(useCallback(() => { void load(); void library.refresh(); }, [load, library.refresh]));
  if (authLoading) return <Screen><ActivityIndicator color={colors.accent} /></Screen>;
  if (!user) return <Redirect href="/login" />;
  const owned = playlist?.creatorId === user.id && !playlist?.isStaffPlaylist;
  const remove = (musicId: string) => Alert.alert("Remove from playlist?", "The song will stay in the music catalog.", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => {
    void api("/api/playlists/" + encodeURIComponent(id) + "/songs/" + encodeURIComponent(musicId), { method: "DELETE" }).then(async () => { await load(); await library.refresh(); }).catch(e => Alert.alert("Could not remove song", e.message));
  } }]);
  const deletePlaylist = () => Alert.alert("Delete playlist?", "This removes the playlist for everyone, but does not delete its songs.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => {
    if (busy) return; setBusy(true);
    void api("/api/playlists/" + encodeURIComponent(id), { method: "DELETE" }).then(async () => { await library.refresh(); router.replace("/(tabs)/library"); }).catch(e => Alert.alert("Could not delete playlist", e.message)).finally(() => setBusy(false));
  } }]);
  const changePicture = async () => {
    if (!owned || busy || pictureBusy.current) return;
    pictureBusy.current = true; setBusy(true);
    try {
      if (Platform.OS === "ios") { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert("Photo permission needed", "Allow photo access in device settings."); }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .85 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      await uploadFile(`/api/playlists/${encodeURIComponent(id)}/picture`, { uri: asset.uri, name: asset.fileName || "playlist-picture.jpg", type: asset.mimeType || "image/jpeg", size: asset.fileSize });
      await load(); await library.refresh();
    } catch (e) { Alert.alert("Could not update playlist picture", e instanceof Error ? e.message : "Try again"); }
    finally { pictureBusy.current = false; setBusy(false); }
  };
  const removePicture = () => Alert.alert("Remove playlist picture?", undefined, [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => {
    setBusy(true); void api(`/api/playlists/${encodeURIComponent(id)}/picture`, { method: "DELETE" }).then(async () => { await load(); await library.refresh(); }).catch(e => Alert.alert("Could not remove picture", e.message)).finally(() => setBusy(false));
  } }]);
  const changeVisibility = async (isPublic: boolean) => {
    if (!owned || busy) return;
    setBusy(true);
    try { await api(`/api/playlists/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ isPublic }) }); await load(); await library.refresh(); }
    catch (e) { Alert.alert("Could not update privacy", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  const saveName = async () => {
    const name = playlistName.trim(); if (!owned || !name || busy) return;
    setBusy(true); try { await api(`/api/playlists/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) }); setNameOpen(false); await load(); await library.refresh(); }
    catch (e) { Alert.alert("Could not rename playlist", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); }
  };
  return <Screen><Stack.Screen options={{ title: "Playlist" }} />
    {loading ? <ActivityIndicator color={colors.accent} /> : null}{error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    {playlist ? <><View style={{ alignItems: "center", marginBottom: 18 }}><Pressable disabled={!owned || busy} onPress={() => void changePicture()} accessibilityRole="button" accessibilityLabel={owned ? "Change playlist picture" : "Playlist picture"}>{playlist.artworkUrl ? <Image source={{ uri: profilePictureUrl(playlist.artworkUrl) }} style={{ width: 190, height: 190, borderRadius: 18 }} /> : <View style={{ width: 190, height: 190, borderRadius: 18, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}><Ionicons name="musical-notes" size={68} color={colors.accent} /></View>}{owned ? <View style={{ position: "absolute", right: 8, bottom: 8, backgroundColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }}>{busy ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={19} color={colors.accentText} />}</View> : null}</Pressable>{owned && playlist.artworkUrl ? <Pressable onPress={removePicture} style={{ padding: 10 }}><Text style={{ color: colors.red }}>Remove picture</Text></Pressable> : null}</View><View style={[ui.row, { alignItems: "flex-start", gap: 8 }]}><View style={{ flex: 1 }}><Title subtitle={"Playlist • " + playlist.creator.username + " • " + playlist.songs.length + " songs • " + compactDuration(playlist.totalDuration)}>{playlist.name}</Title></View>{owned ? <Pressable onPress={() => { setPlaylistName(playlist.name); setNameOpen(true); }} style={{ padding: 10 }}><Ionicons name="pencil" size={22} color={colors.accent} /></Pressable> : null}</View>
      {playlist.description ? <Text style={[ui.body, { marginBottom: 16 }]}>{playlist.description}</Text> : null}
      {playlist.isStaffPlaylist ? <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderColor: colors.gold, borderWidth: 1, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 14 }}><Ionicons name="shield" size={13} color={colors.gold} /><Text style={{ color: colors.gold, fontWeight: "900", fontSize: 11 }}>STAFF ONLY • AUTO-SYNCED</Text></View> : !playlist.isPublic ? <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderColor: colors.softRed, borderWidth: 1, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 14 }}><Ionicons name="lock-closed" size={13} color={colors.softRed} /><Text style={{ color: colors.softRed, fontWeight: "900", fontSize: 11 }}>PRIVATE</Text></View> : null}
      {owned ? <View style={{ marginBottom: 16 }}><VisibilityToggle value={playlist.isPublic} disabled={busy} onChange={value => void changeVisibility(value)} /><Text style={[ui.muted, { marginTop: 8 }]}>{playlist.isPublic ? "Visible to everyone in Search." : "Only you and Developers can open it."}</Text></View> : null}
      {playlist.songs.length ? <Button title="Play playlist" icon="play" onPress={() => void player.play(playlist.songs[0], playlist.songs, { queueControls: true })} /> : null}
      <View style={{ height: 12 }} />
      {owned ? <Button title="Delete playlist" icon="trash-outline" tone="dark" loading={busy} onPress={deletePlaylist} /> : <Button title={playlist.saved ? "Remove from library" : "Add to library"} icon={playlist.saved ? "checkmark" : "add"} tone="dark" onPress={() => { void library.toggleSaved(playlist).then(load).catch(e => Alert.alert("Could not save playlist", e.message)); }} />}
      <Text style={ui.section}>Songs</Text>
      {playlist.songs.map(song => <SongRow key={song.id} song={song} queue={playlist.songs} queueControls onRemove={owned ? () => remove(song.id) : undefined} />)}
      {!playlist.songs.length ? <><Empty label="No songs in this playlist yet" /><Button title="Find songs to add" icon="search" onPress={() => router.push("/(tabs)/search")} /><Text style={[ui.muted, { marginTop: 12 }]}>Tap + next to a song, then choose this playlist.</Text></> : null}
      <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => setNameOpen(false)}><View style={{ flex: 1, justifyContent: "center", padding: 22, backgroundColor: "#000A" }}><View style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 22 }}><Text style={[ui.section, { marginTop: 0 }]}>Rename playlist</Text><Input value={playlistName} onChangeText={setPlaylistName} maxLength={100} /><Button title="Save name" loading={busy} onPress={() => void saveName()} /><View style={{ height: 8 }} /><Button title="Cancel" tone="dark" onPress={() => setNameOpen(false)} /></View></View></Modal>
    </> : null}
  </Screen>;
}
