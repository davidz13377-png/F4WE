import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, Empty, Screen, Title, ui } from "../../src/components/UI";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";

export default function Notifications() {
  const [items, setItems] = useState<any[]>([]); const load = useCallback(() => { void api<any[]>("/api/profile/notifications").then(setItems); }, []); useFocusEffect(load);
  const readAll = async () => { await api("/api/profile/notifications/read", { method: "POST", body: JSON.stringify({ ids: items.map(v => v.id) }) }); load(); };
  return <Screen><Title>Notifications</Title>{items.some(v => !v.read) ? <Button title="Mark all as read" tone="dark" onPress={() => void readAll()} /> : null}<View style={{ height: 16 }} />{items.length ? items.map(item => <Card key={item.id}><View style={[ui.row, { alignItems: "flex-start", gap: 10 }]}>{!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 }} /> : null}<View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "800" }]}>{item.title}</Text><Text style={[ui.body, { color: colors.muted, marginTop: 5 }]}>{item.body}</Text><Text style={[ui.muted, { marginTop: 8 }]}>{new Date(item.createdAt).toLocaleString()}</Text></View></View></Card>) : <Empty label="No notifications" />}</Screen>;
}
