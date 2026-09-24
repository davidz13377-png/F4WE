import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, Empty, Input, OwnerBadge, RankBadge, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { Rank, User } from "../../src/types";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import { ProfilePicture } from "../../src/components/ProfilePicture";

export default function Developer() {
  const { user, refresh } = useAuth();
  const [query, setQuery] = useState(""), [users, setUsers] = useState<User[]>([]), [selected, setSelected] = useState<User | null>(null);
  const [username, setUsername] = useState(""), [busy, setBusy] = useState(false);
  const load = async () => { try { setUsers(await api<User[]>(`/api/developer/users?q=${encodeURIComponent(query)}`)); } catch (e) { Alert.alert("Could not load users", e instanceof Error ? e.message : "Try again"); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [query]);
  if (user?.rank !== "Developer" && !user?.isOwner) return <Redirect href="/(tabs)/profile" />;
  const close = () => { if (!busy) { setSelected(null); setUsername(""); } };
  const open = (item: User) => { setSelected(item); setUsername(item.username); };
  const apply = async (rank: Rank) => {
    if (!selected || busy) return; setBusy(true);
    try { await api(`/api/developer/users/${selected.id}/rank`, { method: "PATCH", body: JSON.stringify({ rank }) }); setSelected(null); await load(); if (selected.id === user.id) await refresh(); }
    catch (e) { Alert.alert("Rank update failed", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); }
  };
  const rename = async () => {
    if (!selected || busy) return; const value = username.trim();
    if (value.length < 3) return Alert.alert("Invalid username", "Username must contain at least 3 characters.");
    setBusy(true); try { const updated = await api<User>(`/api/developer/users/${selected.id}`, { method: "PATCH", body: JSON.stringify({ username: value }) }); setSelected(updated); setUsername(updated.username); await load(); if (updated.id === user.id) await refresh(); Alert.alert("Username updated"); }
    catch (e) { Alert.alert("Rename failed", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); }
  };
  const removePicture = () => {
    if (!selected || busy) return; const target = selected;
    Alert.alert("Remove profile picture?", `Remove ${target.username}'s profile picture?`, [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => {
      setBusy(true); void api(`/api/developer/users/${target.id}/profile-picture`, { method: "DELETE" }).then(async () => { setSelected({ ...target, profilePicture: null }); await load(); if (target.id === user.id) await refresh(); }).catch(e => Alert.alert("Could not remove picture", e.message)).finally(() => setBusy(false));
    } }]);
  };
  const removeAccount = () => {
    if (!selected || busy) return; const target = selected;
    Alert.alert("Delete account permanently?", `${target.username} and their playlists, favorites, requests and reports will be deleted. Uploaded songs stay in F4WE.`, [{ text: "Cancel" }, { text: "Delete account", style: "destructive", onPress: () => {
      setBusy(true); void api(`/api/developer/users/${target.id}`, { method: "DELETE" }).then(async () => { setSelected(null); await load(); }).catch(e => Alert.alert("Could not delete account", e.message)).finally(() => setBusy(false));
    } }]);
  };
  return <Screen><Title subtitle="Rename accounts, manage ranks and profile pictures, or permanently remove users.">Dev Portal</Title><Text style={ui.section}>User Manager</Text><Input placeholder="Search username or 16-digit ID" value={query} onChangeText={setQuery} />
    {users.length ? users.map(item => <Pressable key={item.id} onPress={() => open(item)}><Card><View style={[ui.row, { justifyContent: "space-between", gap: 12 }]}><View style={[ui.row, { flex: 1, gap: 12 }]}><ProfilePicture user={item} size={44} /><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "700" }]}>{item.username}</Text><Text style={[ui.muted, { fontFamily: "monospace", marginTop: 4 }]}>{item.id}</Text></View></View><View>{item.isOwner ? <OwnerBadge /> : null}<RankBadge rank={item.rank} /></View></View></Card></Pressable>) : <Empty label="No users found" />}
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={close}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000A" }}><View style={{ maxHeight: "90%", backgroundColor: colors.surface, padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><ScrollView keyboardShouldPersistTaps="handled"><Text style={[ui.section, { marginTop: 0 }]}>Manage account</Text><Text style={[ui.muted, { marginBottom: 12, fontFamily: "monospace" }]}>{selected?.id}</Text>
      {selected?.isOwner ? <Text style={[ui.body, { color: colors.gold }]}>Protected Owner account. Only /addowner can grant this role.</Text> : <><Text style={ui.label}>Username</Text><Input value={username} maxLength={32} onChangeText={setUsername} editable={!busy} /><Button title="Save username" icon="save-outline" loading={busy} onPress={() => void rename()} />
      <Text style={ui.section}>Rank</Text>{(["Access", "Moderator", "Admin", "Developer"] as Rank[]).map(rank => <View key={rank} style={{ marginBottom: 9 }}><Button title={rank} tone={rank === "Admin" ? "red" : "dark"} loading={busy} onPress={() => void apply(rank)} /></View>)}
      {selected?.profilePicture ? <><Text style={ui.section}>Profile picture</Text><Button title="Remove profile picture" icon="image-outline" tone="dark" loading={busy} onPress={removePicture} /></> : null}
      <Text style={ui.section}>Danger zone</Text><Button title={selected?.id === user.id ? "Cannot delete your own account" : "Delete account"} icon="trash-outline" tone="red" loading={busy} onPress={removeAccount} /></>}
      <View style={{ height: 10 }} /><Button title="Close" tone="dark" loading={busy} onPress={close} /></ScrollView></View></View></Modal>
  </Screen>;
}
