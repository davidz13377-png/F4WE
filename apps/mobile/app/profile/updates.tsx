import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Modal, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

export default function Updates() {
  const { user } = useAuth(); const [items, setItems] = useState<any[]>([]); const [content, setContent] = useState(""); const [editing, setEditing] = useState<string | null>(null); const [open, setOpen] = useState(false);
  const load = useCallback(() => { void api<any[]>("/api/profile/updates").then(setItems).catch(e => Alert.alert("Could not load updates", e.message)); }, []); useFocusEffect(load);
  const save = async () => { try { await api(editing ? `/api/profile/updates/${editing}` : "/api/profile/updates", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ content }) }); setOpen(false); setContent(""); setEditing(null); load(); } catch (e) { Alert.alert("Could not save update", e instanceof Error ? e.message : "Try again"); } };
  const remove = (id: string) => Alert.alert("Delete update?", undefined, [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => { void api(`/api/profile/updates/${id}`, { method: "DELETE" }).then(load).catch(e => Alert.alert("Could not delete update", e.message)); } }]);
  return <Screen><Title subtitle="Release notes and announcements from the development team.">Update feed</Title>{(user?.isOwner || user?.rank === "Developer") ? <Button title="Post update" icon="add" onPress={() => { setEditing(null); setContent(""); setOpen(true); }} /> : null}<View style={{ height: 20 }} />{items.length ? items.map(item => <Card key={item.id}><Text style={ui.body}>{item.content}</Text><Text style={[ui.muted, { marginTop: 10 }]}>{item.developer.username} • {new Date(item.postedDate).toLocaleString()}{item.editedDate ? " • edited" : ""}</Text>{(user?.isOwner || user?.rank === "Developer") && item.developerId === user.id ? <View style={[ui.row, { gap: 20, marginTop: 12 }]}><Pressable onPress={() => { setEditing(item.id); setContent(item.content); setOpen(true); }}><Text style={{ color: colors.accent }}>Edit</Text></Pressable><Pressable onPress={() => void remove(item.id)}><Text style={{ color: colors.red }}>Delete</Text></Pressable></View> : null}</Card>) : <Empty label="No updates yet" />}
    <Modal visible={open && (user?.isOwner || user?.rank === "Developer")} transparent animationType="slide" onRequestClose={() => setOpen(false)}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }}><View style={{ padding: 22, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={[ui.section, { marginTop: 0 }]}>{editing ? "Edit update" : "New update"}</Text><Input multiline value={content} onChangeText={setContent} style={{ minHeight: 140, textAlignVertical: "top" }} /><Button title="Save" onPress={() => void save()} /><View style={{ height: 10 }} /><Button title="Cancel" tone="dark" onPress={() => setOpen(false)} /></View></View></Modal>
  </Screen>;
}
