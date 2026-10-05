import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Screen, Title, ui } from "../../src/components/UI";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

export default function Notifications() {
  const [items, setItems] = useState<any[]>([]), [busy, setBusy] = useState(false);
  const load = useCallback(() => { void api<any[]>("/api/profile/notifications").then(setItems).catch(e => Alert.alert("Could not load notifications", e.message)); }, []); useFocusEffect(load);
  const readAll = async () => { setBusy(true); try { await api("/api/profile/notifications/read", { method: "POST", body: JSON.stringify({ ids: items.map(v => v.id) }) }); load(); } catch (e) { Alert.alert("Could not update notifications", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); } };
  const remove = async (id: string) => { setBusy(true); try { await api(`/api/profile/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }); setItems(current => current.filter(item => item.id !== id)); } catch (e) { Alert.alert("Could not delete notification", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); } };
  const clearAll = () => Alert.alert("Delete all notifications?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete all", style: "destructive", onPress: () => { setBusy(true); void api("/api/profile/notifications", { method: "DELETE" }).then(() => setItems([])).catch(e => Alert.alert("Could not delete notifications", e.message)).finally(() => setBusy(false)); } }]);
  return <Screen><Title>Notifications</Title>{items.length ? <View style={[ui.row, { gap: 8 }]}>{items.some(v => !v.read) ? <View style={{ flex: 1 }}><Button title="Mark all read" tone="dark" loading={busy} onPress={() => void readAll()} /></View> : null}<View style={{ flex: 1 }}><Button title="Delete all" tone="red" loading={busy} onPress={clearAll} /></View></View> : null}<View style={{ height: 16 }} />{items.length ? items.map(item => <Card key={item.id}><View style={[ui.row, { alignItems: "flex-start", gap: 10 }]}>{!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 }} /> : null}<View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "800" }]}>{item.title}</Text><Text style={[ui.body, { color: colors.muted, marginTop: 5 }]}>{item.body}</Text><Text style={[ui.muted, { marginTop: 8 }]}>{new Date(item.createdAt).toLocaleString()}</Text></View><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Delete notification" onPress={() => void remove(item.id)} style={{ padding: 6 }}><Ionicons name="trash-outline" size={20} color={colors.red} /></Pressable></View></Card>) : <Empty label="No notifications" />}</Screen>;
}
