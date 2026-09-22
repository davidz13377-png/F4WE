import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Input, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { UpdateIdea } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

export default function UpdateIdeas() {
  const { user } = useAuth(); const staff = !!user?.isOwner || user?.rank === "Admin" || user?.rank === "Developer";
  const [ideas, setIdeas] = useState<UpdateIdea[]>([]), [content, setContent] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setIdeas(await api<UpdateIdea[]>("/api/profile/update-ideas")); } catch (e) { Alert.alert("Could not load ideas", e instanceof Error ? e.message : "Try again"); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const submit = async () => {
    const value = content.trim(); if (value.length < 5) return Alert.alert("Describe your idea", "Write at least 5 characters.");
    if (busy) return; setBusy(true);
    try { await api("/api/profile/update-ideas", { method: "POST", body: JSON.stringify({ content: value }) }); setContent(""); await load(); Alert.alert("Idea sent", "Thank you for helping improve F4WE."); }
    catch (e) { Alert.alert("Could not send idea", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); }
  };
  const remove = (id: string) => Alert.alert("Delete idea?", undefined, [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => void api(`/api/profile/update-ideas/${encodeURIComponent(id)}`, { method: "DELETE" }).then(load).catch(e => Alert.alert("Could not delete idea", e.message)) }]);
  return <Screen><Title subtitle={staff ? "Submit an idea or review ideas from every F4WE user." : "Tell the staff what you would like to see in a future update."}>Update Ideas</Title>
    <Input placeholder="Your update idea" multiline maxLength={3000} value={content} onChangeText={setContent} style={{ minHeight: 120, textAlignVertical: "top" }} />
    <Button title="Send idea" icon="bulb-outline" loading={busy} onPress={() => void submit()} />
    <Text style={ui.section}>{staff ? "Ideas from users" : "Your ideas"}</Text>{loading ? <ActivityIndicator color={colors.accent} /> : null}
    {!loading && (ideas.length ? ideas.map(idea => <Card key={idea.id}>{idea.user ? <View style={[ui.row, { justifyContent: "space-between", marginBottom: 10 }]}><Text style={[ui.body, { fontWeight: "700" }]}>{idea.user.username}</Text><RankBadge rank={idea.user.rank} /></View> : null}<Text style={ui.body}>{idea.content}</Text><View style={[ui.row, { justifyContent: "space-between", marginTop: 12 }]}><Text style={ui.muted}>{new Date(idea.createdDate).toLocaleString()}</Text><Pressable onPress={() => remove(idea.id)}><Text style={{ color: colors.red }}>Delete</Text></Pressable></View></Card>) : <Empty label="No update ideas yet" />)}
  </Screen>;
}
