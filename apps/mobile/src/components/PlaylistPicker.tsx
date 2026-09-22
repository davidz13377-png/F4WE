import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../lib/api";
import { colors } from "../lib/theme";
import type { Playlist } from "../types";
import { useLibrary } from "../context/LibraryContext";
import { Button, Empty, Input, ui } from "./UI";
import { F4WEAlert as Alert } from "./F4WEAlert";

export function PlaylistPicker() {
  const { selectedSong, closePicker, refresh } = useLibrary(); const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<Playlist[]>([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [name, setName] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    if (!selectedSong) return;
    let live = true; setName(""); setError(""); setLists([]); setLoading(true);
    void api<Playlist[]>("/api/playlists?mine=true").then(items => { if (live) setLists(items); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedSong?.id]);
  const add = async (id: string) => {
    if (!selectedSong || busy) return;
    setBusy(true);
    try { await api(`/api/playlists/${encodeURIComponent(id)}/songs`, { method: "POST", body: JSON.stringify({ musicId: selectedSong.id }) }); await refresh(); closePicker(); }
    catch (e) { Alert.alert("Could not add song", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!selectedSong || busy || !name.trim()) return;
    setBusy(true);
    try {
      const playlist = await api<Playlist>("/api/playlists", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setLists(items => [playlist, ...items]); setName("");
      await api(`/api/playlists/${encodeURIComponent(playlist.id)}/songs`, { method: "POST", body: JSON.stringify({ musicId: selectedSong.id }) }); await refresh(); closePicker();
    } catch (e) { Alert.alert("Could not create playlist or add song", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  return <Modal visible={!!selectedSong} transparent animationType="slide" onRequestClose={() => { if (!busy) closePicker(); }}>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000A" }}>
      <View style={{ maxHeight: "85%", backgroundColor: colors.surface, padding: 22, paddingBottom: insets.bottom + 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <Text style={[ui.section, { marginTop: 0 }]}>Add to playlist</Text><Text style={[ui.muted, { marginBottom: 16 }]}>{selectedSong?.title}</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}{error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled">{lists.map(list => <Pressable key={list.id} disabled={busy} accessibilityRole="button" accessibilityLabel={`Add to ${list.name}`} onPress={() => void add(list.id)} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={ui.body}>{list.name}</Text><Text style={ui.muted}>Playlist • {list.trackCount} songs</Text></Pressable>)}
          {!loading && !lists.length ? <Empty label="Create your first playlist below" /> : null}
        </ScrollView>
        <Input value={name} maxLength={100} onChangeText={setName} placeholder="New playlist name" style={{ marginTop: 16 }} />
        <Button title="Create playlist & add song" loading={busy} onPress={() => void create()} />
        <View style={{ height: 10 }} /><Button title="Cancel" tone="dark" loading={busy} onPress={closePicker} />
      </View>
    </View>
  </Modal>;
}
