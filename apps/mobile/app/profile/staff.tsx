import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Redirect, router } from "expo-router";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Input, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { ReviewItem } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

const isSpotifySource = (value?: string | null) => !!value?.startsWith("https://open.spotify.com/track/");

export default function Staff() {
  const { user } = useAuth(); const [tab, setTab] = useState<"requests" | "bugs">("requests"); const [requests, setRequests] = useState<ReviewItem[]>([]); const [bugs, setBugs] = useState<ReviewItem[]>([]); const [reject, setReject] = useState<{ kind: "requests" | "bugs"; id: string } | null>(null); const [reason, setReason] = useState("");
  const [importId, setImportId] = useState<string | null>(null), [title, setTitle] = useState(""), [artist, setArtist] = useState(""), [busy, setBusy] = useState(false);
  const allowed = !!user?.isOwner || user?.rank === "Admin" || user?.rank === "Developer";
  const load = useCallback(() => { if (!allowed) return; void Promise.all([api<ReviewItem[]>("/api/profile/staff/requests"), api<ReviewItem[]>("/api/profile/staff/bugs")]).then(([r, b]) => { setRequests(r); setBugs(b); }).catch(e => Alert.alert("Could not load staff portal", e.message)); }, [allowed]); useFocusEffect(load);
  if (!user || !allowed) return <Redirect href="/(tabs)/profile" />;
  const review = async (kind: "requests" | "bugs", id: string, status: string, response?: string) => { try { await api(`/api/profile/staff/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ status, reason: response }) }); setReject(null); setReason(""); load(); } catch (e) { Alert.alert("Could not review item", e instanceof Error ? e.message : "Try again"); } };
  const queueImport = async () => {
    if (!importId || busy) return;
    setBusy(true);
    try { await api(`/api/profile/staff/requests/${encodeURIComponent(importId)}/import`, { method: "POST", body: JSON.stringify({ title, artist }) }); setImportId(null); setTitle(""); setArtist(""); load(); Alert.alert("Queued", "The Discord bot will download the MP3 and add it to the server. Keep the bot running."); }
    catch (e) { Alert.alert("Could not queue import", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(false); }
  };
  const list = tab === "requests" ? requests : bugs;
  return <Screen><Title subtitle="Review user submissions and send status notifications.">Staff Portal</Title><Button title="Music Manager" icon="trash-outline" tone="dark" onPress={() => router.push("/profile/music-manager")} /><View style={{ height: 16 }} /><View style={[ui.row, { gap: 8, marginBottom: 18 }]}><View style={{ flex: 1 }}><Button title="Music requests" tone={tab === "requests" ? "green" : "dark"} onPress={() => setTab("requests")} /></View><View style={{ flex: 1 }}><Button title="Bug reports" tone={tab === "bugs" ? "green" : "dark"} onPress={() => setTab("bugs")} /></View></View>
    {list.length ? list.map(item => <Card key={item.id}>
      <View style={[ui.row, { justifyContent: "space-between" }]}><Text style={[ui.body, { fontWeight: "800" }]}>{item.user?.username}</Text>{item.user ? <RankBadge rank={item.user.rank} /> : null}</View>
      <Text style={[ui.body, { marginTop: 12 }]}>{tab === "requests" ? item.songsRequested : item.description}</Text>
      <Text style={[ui.muted, { marginTop: 8 }]}>Status: {item.status}</Text>
      {tab === "requests" && item.sourceUrl ? <View style={[ui.row, { gap: 16, marginTop: 12 }]}>
        <Pressable accessibilityLabel={isSpotifySource(item.sourceUrl) ? "Open Spotify track" : "Open YouTube video"} onPress={() => void Linking.openURL(item.sourceUrl!)}><Ionicons name={isSpotifySource(item.sourceUrl) ? "musical-notes" : "logo-youtube"} size={30} color={isSpotifySource(item.sourceUrl) ? "#1ED760" : "#FF3030"} /></Pressable>
        {item.status === "Pending" && !isSpotifySource(item.sourceUrl) ? <Pressable accessibilityLabel="Import song" onPress={() => { setImportId(item.id); setTitle(item.requestedTitle ?? ""); setArtist(item.requestedArtist ?? ""); }}><Ionicons name="add-circle-outline" size={32} color={colors.accent} /></Pressable> : null}
        {item.status === "Pending" && isSpotifySource(item.sourceUrl) ? <Pressable accessibilityLabel="Upload authorized MP3" onPress={() => router.push("/profile/uploader")}><Ionicons name="cloud-upload-outline" size={31} color={colors.accent} /></Pressable> : null}
      </View> : null}
      {item.rejectionReason ? <Text style={{ color: colors.red, marginTop: 7 }}>{item.rejectionReason}</Text> : null}
      {item.status === "Pending" ? <View style={[ui.row, { gap: 8, marginTop: 14 }]}>
        {tab === "bugs" || !item.sourceUrl || isSpotifySource(item.sourceUrl) ? <View style={{ flex: 1 }}><Button title={tab === "requests" ? "Accept" : "Fixed"} onPress={() => void review(tab, item.id, tab === "requests" ? "Accepted" : "Fixed")} /></View> : null}
        <View style={{ flex: 1 }}><Button title="Reject" tone="red" onPress={() => setReject({ kind: tab, id: item.id })} /></View>
      </View> : null}
    </Card>) : <Empty label="Nothing to review" />}
    <Modal visible={!!importId} transparent animationType="slide" onRequestClose={() => setImportId(null)}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }}><View style={{ padding: 22, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={[ui.section, { marginTop: 0 }]}>Import YouTube song</Text><Input placeholder="Song title" maxLength={150} value={title} onChangeText={setTitle} /><Input placeholder="Artist" maxLength={150} value={artist} onChangeText={setArtist} /><Button title="Send to Discord bot" loading={busy} onPress={() => void queueImport()} /><View style={{ height: 10 }} /><Button title="Cancel" tone="dark" onPress={() => setImportId(null)} /></View></View></Modal>
    <Modal visible={!!reject} transparent animationType="slide"><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }}><View style={{ padding: 22, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={[ui.section, { marginTop: 0 }]}>Rejection reason</Text><Input multiline value={reason} onChangeText={setReason} placeholder="Explain why this was rejected" style={{ minHeight: 120, textAlignVertical: "top" }} /><Button title="Send rejection" tone="red" onPress={() => reject && void review(reject.kind, reject.id, "Rejected", reason)} /><View style={{ height: 10 }} /><Button title="Cancel" tone="dark" onPress={() => setReject(null)} /></View></View></Modal>
  </Screen>;
}
