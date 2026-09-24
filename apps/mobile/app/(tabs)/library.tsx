import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { PlaylistRow } from "../../src/components/PlaylistRow";
import { useLibrary } from "../../src/context/LibraryContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { Playlist } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { VisibilityToggle } from "../../src/components/VisibilityToggle";

export default function Library() {
  const library = useLibrary(), insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [description, setDescription] = useState(""), [isPublic, setPublic] = useState(false), [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { void library.refresh(); }, [library.refresh]));
  const create = async () => {
    if (busy || !name.trim()) return; setBusy(true);
    try {
      const list = await api<Playlist>("/api/playlists", { method: "POST", body: JSON.stringify({ name: name.trim(), description, isPublic }) });
      setOpen(false); setName(""); setDescription(""); setPublic(false); await library.refresh();
      router.push({ pathname: "/playlist/[id]", params: { id: list.id } });
    } catch (e) { Alert.alert("Could not create playlist", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  return <Screen><Title subtitle="Your favorites and saved playlists.">Your Library</Title>
    <Pressable accessibilityRole="button" onPress={() => router.push("/favorites")} style={[ui.row, { gap: 14, paddingVertical: 20 }]}>
      <View style={{ width: 58, height: 58, borderRadius: 12, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" }}><Ionicons name="heart" size={30} color={colors.white} /></View>
      <View><Text style={[ui.body, { fontWeight: "900", fontSize: 20 }]}>Favorites</Text><Text style={ui.muted}>{library.favorites.length} liked songs</Text></View>
    </Pressable>
    <Button title="Create playlist" icon="add" onPress={() => setOpen(true)} />
    <Text style={ui.section}>Your playlists</Text>
    {library.error ? <Text style={{ color: colors.red }}>{library.error}</Text> : null}
    {library.loading ? <ActivityIndicator color={colors.accent} /> : null}
    {library.playlists.map(list => <PlaylistRow key={list.id} playlist={list} />)}
    {!library.loading && !library.playlists.length ? <Empty label="Create a playlist or save one from Search" /> : null}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => { if (!busy) setOpen(false); }}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }}>
      <View style={{ backgroundColor: colors.surface, padding: 22, paddingBottom: insets.bottom + 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <Text style={[ui.section, { marginTop: 0 }]}>New playlist</Text><Input placeholder="Playlist name" maxLength={100} value={name} onChangeText={setName} /><Input placeholder="Description" maxLength={500} value={description} onChangeText={setDescription} multiline />
        <Text style={[ui.label, { marginTop: 6 }]}>Who can open it?</Text><VisibilityToggle value={isPublic} onChange={setPublic} disabled={busy} /><Text style={[ui.muted, { marginTop: 8, marginBottom: 16 }]}>{isPublic ? "Anyone can find this playlist in Search." : "Only you can open it. Private is the default."}</Text>
        <Button title="Create" loading={busy} onPress={() => void create()} /><View style={{ height: 10 }} /><Button title="Cancel" tone="dark" loading={busy} onPress={() => setOpen(false)} />
      </View></View></Modal>
  </Screen>;
}
