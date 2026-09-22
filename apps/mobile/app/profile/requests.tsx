import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { ReviewItem } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

export default function Requests() {
  const [items, setItems] = useState<ReviewItem[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { void api<ReviewItem[]>("/api/profile/requests").then(setItems); }, []); useFocusEffect(load);
  const submit = async () => { try { setBusy(true); await api("/api/profile/requests", { method: "POST", body: JSON.stringify({ sourceUrl: text.trim() }) }); setText(""); load(); } catch (e) { Alert.alert("Request failed", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); } };
  const remove = async (id: string) => { await api(`/api/profile/requests/${id}`, { method: "DELETE" }); load(); };
  return <Screen><Title subtitle="Send one YouTube video link per request.">Request music</Title><Input placeholder="https://www.youtube.com/watch?v=..." autoCapitalize="none" autoCorrect={false} value={text} onChangeText={setText} /><Button title="Send request" loading={busy} onPress={() => void submit()} /><Text style={ui.section}>History</Text>{items.length ? items.map(item => <Card key={item.id}><View style={[ui.row, { justifyContent: "space-between", alignItems: "flex-start" }]}><View style={{ flex: 1 }}><Pressable onPress={() => item.sourceUrl && void Linking.openURL(item.sourceUrl)}><Text style={ui.body}>{item.requestedTitle ? `${item.requestedTitle} — ${item.requestedArtist}` : item.songsRequested}</Text></Pressable><Text style={[ui.muted, { marginTop: 8, color: item.status === "Accepted" ? colors.accent : item.status === "Rejected" ? colors.red : colors.muted }]}>{item.status} • {new Date(item.requestDate!).toLocaleString()}</Text>{item.rejectionReason ? <Text style={[ui.body, { color: colors.red, marginTop: 8 }]}>Reason: {item.rejectionReason}</Text> : null}</View><Pressable onPress={() => void remove(item.id)}><Text style={{ color: colors.muted }}>Delete</Text></Pressable></View></Card>) : <Empty label="No music requests yet" />}</Screen>;
}
