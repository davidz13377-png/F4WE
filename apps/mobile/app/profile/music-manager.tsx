import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useCallback, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { useLibrary } from "../../src/context/LibraryContext";
import { usePlayer } from "../../src/context/PlayerContext";
import { api, uploadFile } from "../../src/lib/api";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { profilePictureUrl } from "../../src/lib/media";
import { colors } from "../../src/lib/theme";
import type { Song } from "../../src/types";

export default function MusicManager() {
  const { user, loading } = useAuth(), library = useLibrary(), player = usePlayer();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<Song | null>(null), [title, setTitle] = useState(""), [artist, setArtist] = useState("");
  const [lyricsFile, setLyricsFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null), [lyricsType, setLyricsType] = useState<"timed" | "plain">("timed");
  const [songs, setSongs] = useState<Song[]>([]), [query, setQuery] = useState(""), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const canDelete = !!user?.isOwner || user?.rank === "Admin" || user?.rank === "Developer";
  const allowed = !!user?.isOwner || user?.rank === "Moderator" || canDelete;
  const load = useCallback(async () => {
    if (!allowed) return;
    try { setSongs(await api<Song[]>("/api/music?q=" + encodeURIComponent(query.trim()))); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load music"); }
  }, [allowed, query]);
  useFocusEffect(useCallback(() => { const timer = setTimeout(() => void load(), 300); return () => clearTimeout(timer); }, [load]));
  if (loading) return <Screen><ActivityIndicator color={colors.accent} /></Screen>;
  if (!allowed) return <Redirect href="/(tabs)/profile" />;
  const edit = (song: Song) => { if (busy) return; setEditing(song); setTitle(song.title); setArtist(song.artist || ""); setLyricsFile(null); setLyricsType(song.lyricsSynced ? "timed" : "plain"); };
  const save = async () => {
    if (!editing || busy) return;
    if (!title.trim()) return Alert.alert("Title required", "Enter a song title.");
    setBusy(editing.id);
    try {
      const updated = await api<Song>("/api/music/" + encodeURIComponent(editing.id), { method: "PATCH", body: JSON.stringify({ title: title.trim(), artist: artist.trim() || null }) });
      setSongs(items => items.map(item => item.id === updated.id ? updated : item));
      setEditing(null); await player.updateSongMetadata(updated); await library.refresh(); await load();
    } catch (e) { Alert.alert("Could not save song", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(null); }
  };
  const remove = (song: Song) => Alert.alert("Delete song?", '"' + song.title + '" will be removed from the catalog, all playlists and favorites.', [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => {
    if (busy) return; setBusy(song.id);
    void (async () => {
      try {
        await api("/api/music/" + encodeURIComponent(song.id), { method: "DELETE" });
        setSongs(items => items.filter(item => item.id !== song.id));
        await player.removeQueuedSong(song.id); await library.forgetSong(song.id); await load();
      } catch (e) { Alert.alert("Could not complete deletion", e instanceof Error ? e.message : "Try again"); }
      finally { setBusy(null); }
    })();
  } }]);
  const changePicture = async (removeImage = false) => {
    if (!editing || busy) return;
    try {
      let selected: { uri: string; name: string; type: string; size?: number } | null = null;
      if (!removeImage) {
        if (Platform.OS === "ios") { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert("Photo permission needed"); }
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .85 });
        if (picked.canceled || !picked.assets?.length) return;
        const asset = picked.assets[0];
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
        selected = { uri: asset.uri, name: asset.fileName || "music-artwork.jpg", type: asset.mimeType || "image/jpeg", size: asset.fileSize };
      }
      setBusy(editing.id);
      const id = encodeURIComponent(editing.id);
      const result = removeImage ? (await api(`/api/music/${id}/picture`, { method: "DELETE" }), { artworkUrl: null }) : await uploadFile<{ artworkUrl: string }>(`/api/music/${id}/picture`, selected!);
      const updated = { ...editing, artworkUrl: result.artworkUrl };
      setEditing(updated); setSongs(items => items.map(item => item.id === updated.id ? updated : item));
      await player.updateSongMetadata(updated); await library.refresh(); await load();
    } catch (e) { Alert.alert("Could not change artwork", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(null); }
  };
  const chooseLyrics = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0], expected = lyricsType === "timed" ? ".lrc" : ".txt";
    if (!asset.name.toLowerCase().endsWith(expected)) return Alert.alert("Wrong lyrics file", `Choose a ${expected} file for this mode.`);
    if (asset.size && asset.size > 100_000) return Alert.alert("Lyrics file too large", "The maximum size is 100 KB.");
    setLyricsFile(asset);
  };
  const saveLyrics = async () => {
    if (!editing || !lyricsFile || busy) return;
    setBusy(editing.id);
    try {
      const content = await new File(lyricsFile.uri).text();
      await api(`/api/music/${encodeURIComponent(editing.id)}/lyrics`, { method: "PUT", body: JSON.stringify({ type: lyricsType, content }) });
      const updated = { ...editing, hasLyrics: true, lyricsSynced: lyricsType === "timed" };
      setEditing(updated); setSongs(items => items.map(item => item.id === updated.id ? updated : item)); setLyricsFile(null);
      Alert.alert("Lyrics saved", lyricsType === "timed" ? "Synced LRC lyrics are ready in the player." : "Plain lyrics are ready in the player.");
    } catch (e) { Alert.alert("Could not save lyrics", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(null); }
  };
  const removeLyrics = () => {
    if (!editing || busy) return;
    Alert.alert("Remove lyrics?", undefined, [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => {
      setBusy(editing.id); void api(`/api/music/${encodeURIComponent(editing.id)}/lyrics`, { method: "DELETE" }).then(() => {
        const updated = { ...editing, hasLyrics: false, lyricsSynced: false }; setEditing(updated); setSongs(items => items.map(item => item.id === updated.id ? updated : item)); setLyricsFile(null);
      }).catch(e => Alert.alert("Could not remove lyrics", e.message)).finally(() => setBusy(null));
    } }]);
  };
  return <Screen><Title subtitle="Moderator / Admin / Developer: edit song details and artwork.">Music Manager</Title><Input placeholder="Search songs or artists" maxLength={100} value={query} onChangeText={setQuery} />
    {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    {songs.map(song => <View key={song.id} style={[ui.row, { justifyContent: "space-between", gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "800" }]}>{song.title}</Text><Text style={ui.muted}>{song.artist || "Unknown artist"}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={"Edit " + song.title} disabled={!!busy} onPress={() => edit(song)} style={{ padding: 10, alignItems: "center" }}><Ionicons name="create-outline" size={23} color={colors.accent} /><Text style={{ color: colors.accent, fontSize: 12, marginTop: 4 }}>Edit</Text></Pressable>
      {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={"Delete " + song.title} disabled={!!busy} onPress={() => remove(song)} style={{ padding: 12 }}>{busy === song.id ? <ActivityIndicator color={colors.red} /> : <Ionicons name="trash-outline" size={25} color={colors.red} />}</Pressable> : null}
    </View>)}{!songs.length && !error ? <Empty label="No matching songs" /> : null}
    <Modal visible={!!editing && allowed} transparent animationType="slide" onRequestClose={() => { if (!busy) setEditing(null); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000A" }}>
        <View style={{ backgroundColor: colors.surface, padding: 22, paddingBottom: insets.bottom + 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <ScrollView keyboardShouldPersistTaps="handled"><Text style={[ui.section, { marginTop: 0 }]}>Edit song</Text>
            {editing?.artworkUrl ? <ImagePickerPreview uri={profilePictureUrl(editing.artworkUrl)!} /> : null}
            <Button title="Change or add artwork" icon="image-outline" loading={!!busy} onPress={() => void changePicture()} />
            {editing?.artworkUrl ? <View style={{ marginTop: 8 }}><Button title="Remove artwork" tone="dark" loading={!!busy} onPress={() => void changePicture(true)} /></View> : null}
            <Text style={ui.label}>Title</Text><Input accessibilityLabel="Song title" value={title} maxLength={150} onChangeText={setTitle} editable={!busy} placeholder="Song title" />
            <Text style={ui.label}>Artist</Text><Input accessibilityLabel="Artist" value={artist} maxLength={150} onChangeText={setArtist} editable={!busy} placeholder="Artist (optional)" />
            <Text style={[ui.label, { marginTop: 6 }]}>Lyrics {editing?.hasLyrics ? "• added" : "• not added yet"}</Text>
            <View style={{ flexDirection: "row", backgroundColor: colors.raised, borderRadius: 14, padding: 4, marginBottom: 10 }}><LyricsMode label="Timed .lrc" selected={lyricsType === "timed"} onPress={() => { setLyricsType("timed"); setLyricsFile(null); }} /><LyricsMode label="Plain .txt" selected={lyricsType === "plain"} onPress={() => { setLyricsType("plain"); setLyricsFile(null); }} /></View>
            <Button title={lyricsFile?.name || `Choose ${lyricsType === "timed" ? ".lrc" : ".txt"} file`} icon="document-text-outline" tone="dark" loading={!!busy} onPress={() => void chooseLyrics()} />
            {lyricsFile ? <View style={{ marginTop: 8 }}><Button title="Save lyrics" icon="checkmark" loading={!!busy} onPress={() => void saveLyrics()} /></View> : null}
            {editing?.hasLyrics ? <View style={{ marginTop: 8, marginBottom: 12 }}><Button title="Remove lyrics" tone="dark" loading={!!busy} onPress={removeLyrics} /></View> : <View style={{ height: 12 }} />}
            <Button title="Save changes" loading={!!busy} onPress={() => void save()} /><View style={{ height: 10 }} />
            <Button title="Cancel" tone="dark" loading={!!busy} onPress={() => setEditing(null)} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </Screen>;
}
function ImagePickerPreview({ uri }: { uri: string }) { return <View style={{ alignItems: "center", marginBottom: 12 }}><Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 12 }} /></View>; }
function LyricsMode({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) { return <Pressable onPress={onPress} style={{ flex: 1, minHeight: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.text : "transparent" }}><Text style={{ color: selected ? colors.background : colors.muted, fontWeight: "800" }}>{label}</Text></Pressable>; }
