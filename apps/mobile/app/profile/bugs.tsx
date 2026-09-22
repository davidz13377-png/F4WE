import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { ReviewItem } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

export default function Bugs() {
  const [items, setItems] = useState<ReviewItem[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await api<ReviewItem[]>("/api/profile/bugs")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load bug reports"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const submit = async () => {
    const description = text.trim();
    if (description.length < 10) return Alert.alert("More detail needed", "Write at least 10 characters so staff can reproduce the problem.");
    if (busy) return;
    try { setBusy(true); await api("/api/profile/bugs", { method: "POST", body: JSON.stringify({ description }) }); setText(""); await load(); Alert.alert("Report sent", "Staff can now see your bug report."); }
    catch (e) { Alert.alert("Report failed", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  const remove = (id: string) => Alert.alert("Delete report?", "This removes it from your history.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => {
    void api(`/api/profile/bugs/${encodeURIComponent(id)}`, { method: "DELETE" }).then(load).catch(e => Alert.alert("Could not delete report", e.message));
  } }]);
  return <Screen><Title subtitle="Describe what happened, what you expected, and how to reproduce it.">Report a bug</Title>
    <Input placeholder="Bug description (at least 10 characters)" multiline maxLength={5000} value={text} onChangeText={setText} style={{ minHeight: 130, textAlignVertical: "top" }} />
    <Button title="Submit report" loading={busy} onPress={() => void submit()} /><Text style={ui.section}>History</Text>
    {loading ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Card><Text style={{ color: colors.red, marginBottom: 12 }}>{error}</Text><Button title="Try again" tone="dark" onPress={() => void load()} /></Card> : null}
    {!loading && !error && (items.length ? items.map(item => <Card key={item.id}><View style={[ui.row, { justifyContent: "space-between", alignItems: "flex-start", gap: 14 }]}><View style={{ flex: 1 }}><Text style={ui.body}>{item.description}</Text><Text style={[ui.muted, { marginTop: 8, color: item.status === "Fixed" ? colors.access : item.status === "Rejected" ? colors.red : colors.muted }]}>{item.status} • {new Date(item.reportDate!).toLocaleString()}</Text>{item.adminResponse ? <Text style={[ui.body, { color: item.status === "Rejected" ? colors.red : colors.muted, marginTop: 8 }]}>Staff response: {item.adminResponse}</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Delete bug report" onPress={() => remove(item.id)}><Text style={{ color: colors.muted }}>Delete</Text></Pressable></View></Card>) : <Empty label="No bug reports yet" />)}
  </Screen>;
}
