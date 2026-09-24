import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Empty, Input, Screen, Title, ui } from "../src/components/UI";
import { ProfilePicture } from "../src/components/ProfilePicture";
import { useAuth } from "../src/context/AuthContext";
import { usePlayer } from "../src/context/PlayerContext";
import { api } from "../src/lib/api";
import { colors } from "../src/lib/theme";
import type { Friend, FriendRequest, FriendSearchResult } from "../src/types";
import { F4WEAlert as Alert } from "../src/components/F4WEAlert";

type Tab = "friends" | "search" | "requests";
export default function FriendsScreen() {
  const { user, refresh, socket } = useAuth(), player = usePlayer();
  const [tab, setTab] = useState<Tab>("friends"), [friends, setFriends] = useState<Friend[]>([]), [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState(""), [results, setResults] = useState<FriendSearchResult[]>([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState<string | null>(null);
  const loadFriends = useCallback(async () => { try { setFriends(await api<Friend[]>("/api/friends")); } catch (e) { Alert.alert("Could not load friends", e instanceof Error ? e.message : "Try again"); } }, []);
  const loadRequests = useCallback(async () => { try { setRequests(await api<FriendRequest[]>("/api/friends/requests")); } catch (e) { Alert.alert("Could not load requests", e instanceof Error ? e.message : "Try again"); } }, []);
  useFocusEffect(useCallback(() => { void loadFriends(); void loadRequests(); }, [loadFriends, loadRequests]));
  useEffect(() => {
    if (tab !== "friends") return;
    const timer = setInterval(() => void loadFriends(), 5_000); return () => clearInterval(timer);
  }, [tab, loadFriends]);
  useEffect(() => {
    let live = true; const clean = query.trim();
    if (clean.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true); const timer = setTimeout(() => void api<FriendSearchResult[]>(`/api/friends/search?q=${encodeURIComponent(clean)}`).then(value => { if (live) setResults(value); }).catch(e => { if (live) Alert.alert("Search failed", e.message); }).finally(() => { if (live) setLoading(false); }), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  const setPrivacy = async (shareListening: boolean) => {
    if (!user || busy) return; setBusy("privacy");
    try { await api("/api/profile/me/listening-privacy", { method: "PATCH", body: JSON.stringify({ shareListening }) }); socket?.emit("listening:privacy", shareListening); await refresh(); await loadFriends(); }
    catch (e) { Alert.alert("Could not update privacy", e instanceof Error ? e.message : "Try again"); }
    finally { setBusy(null); }
  };
  const send = async (username: string) => {
    setBusy(username); try { await api("/api/friends/requests", { method: "POST", body: JSON.stringify({ username }) }); setResults(items => items.map(item => item.username === username ? { ...item, relationship: "sent" } : item)); }
    catch (e) { Alert.alert("Could not send request", e instanceof Error ? e.message : "Try again"); } finally { setBusy(null); }
  };
  const review = async (request: FriendRequest, accept: boolean) => {
    setBusy(request.id); try { await api(`/api/friends/requests/${encodeURIComponent(request.id)}${accept ? "/accept" : ""}`, { method: accept ? "POST" : "DELETE" }); await Promise.all([loadRequests(), loadFriends()]); }
    catch (e) { Alert.alert("Could not update request", e instanceof Error ? e.message : "Try again"); } finally { setBusy(null); }
  };
  const join = async (friend: Friend) => {
    setBusy(friend.id); try { if (player.followingUserId === friend.id) player.stopFollowing(); else await player.followUser(friend.id); }
    catch (e) { Alert.alert("Could not listen together", e instanceof Error ? e.message : "Try again"); } finally { setBusy(null); }
  };
  return <Screen><Stack.Screen options={{ title: "Friends" }} /><Title subtitle="Add friends, see who is online and listen together in sync.">Friends</Title>
    <View style={styles.privacy}><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "900" }]}>Share what I am listening to</Text><Text style={ui.muted}>{user?.shareListening ? "Friends can see and join your music." : "Private: nobody can see or join."}</Text></View><Pressable disabled={busy === "privacy"} onPress={() => void setPrivacy(!user?.shareListening)} style={[styles.switch, user?.shareListening ? styles.switchOn : null]}><View style={[styles.knob, user?.shareListening ? styles.knobOn : null]} /></Pressable></View>
    <View style={styles.tabs}><TabButton label="Friends" icon="people" selected={tab === "friends"} onPress={() => setTab("friends")} /><TabButton label="Search" icon="search" selected={tab === "search"} onPress={() => setTab("search")} /><TabButton label={`Requests${requests.length ? ` (${requests.length})` : ""}`} icon="mail" selected={tab === "requests"} onPress={() => setTab("requests")} /></View>
    {tab === "friends" ? <>{friends.map(friend => <View key={friend.id} style={styles.person}><ProfilePicture user={friend} size={54} /><View style={{ flex: 1 }}><View style={[ui.row, { gap: 7 }]}><Text style={[ui.body, { fontWeight: "900" }]}>{friend.username}</Text><View style={[styles.onlineDot, { backgroundColor: friend.online ? colors.access : colors.muted }]} /></View><Text numberOfLines={2} style={[ui.muted, friend.listening ? { color: colors.softRed } : null]}>{friend.listening ? `${friend.listening.playing ? "Listening" : "Paused"}: ${friend.listening.title}${friend.listening.artist ? ` • ${friend.listening.artist}` : ""}` : friend.online ? "Online • listening is private" : "Offline"}</Text></View>
      {friend.listening ? <Pressable disabled={busy === friend.id} onPress={() => void join(friend)} style={[styles.join, player.followingUserId === friend.id ? styles.joining : null]}>{busy === friend.id ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name={player.followingUserId === friend.id ? "stop" : "headset"} size={20} color={colors.background} />}</Pressable> : null}</View>)}{!friends.length ? <Empty label="Your accepted friends will appear here" /> : null}</> : null}
    {tab === "search" ? <><Input value={query} onChangeText={setQuery} placeholder="Search exact or partial username" autoCapitalize="none" maxLength={32} />{loading ? <ActivityIndicator color={colors.softRed} /> : results.map(result => <View key={result.id} style={styles.person}><ProfilePicture user={result} size={50} /><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "900" }]}>{result.username}</Text><Text style={ui.muted}>{result.relationship === "friend" ? "Already friends" : result.relationship === "sent" ? "Request sent" : result.relationship === "received" ? "Sent you a request" : result.rank}</Text></View>{result.relationship === "none" ? <Pressable disabled={busy === result.username} onPress={() => void send(result.username)} style={styles.add}><Ionicons name="person-add" size={20} color={colors.background} /></Pressable> : null}</View>)}{query.trim().length >= 2 && !loading && !results.length ? <Empty label="No matching users" /> : null}</> : null}
    {tab === "requests" ? <>{requests.map(request => <View key={request.id} style={styles.person}><ProfilePicture user={request.sender} size={50} /><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "900" }]}>{request.sender.username}</Text><Text style={ui.muted}>Wants to be your friend</Text></View><Pressable disabled={busy === request.id} onPress={() => void review(request, true)} style={styles.accept}><Ionicons name="checkmark" size={21} color={colors.background} /></Pressable><Pressable disabled={busy === request.id} onPress={() => void review(request, false)} style={styles.reject}><Ionicons name="close" size={21} color={colors.text} /></Pressable></View>)}{!requests.length ? <Empty label="No pending friend requests" /> : null}</> : null}
  </Screen>;
}

function TabButton({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress(): void }) { return <Pressable onPress={onPress} style={[styles.tab, selected ? styles.tabSelected : null]}><Ionicons name={icon} size={16} color={selected ? colors.background : colors.muted} /><Text numberOfLines={1} style={{ color: selected ? colors.background : colors.muted, fontWeight: "900", fontSize: 11 }}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({
  privacy: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 16 },
  switch: { width: 54, height: 30, borderRadius: 15, padding: 3, backgroundColor: colors.raised, justifyContent: "center" }, switchOn: { backgroundColor: colors.softRed }, knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text }, knobOn: { alignSelf: "flex-end" },
  tabs: { flexDirection: "row", gap: 5, backgroundColor: colors.surface, padding: 5, borderRadius: 16, marginBottom: 16 }, tab: { flex: 1, minHeight: 42, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, tabSelected: { backgroundColor: colors.text },
  person: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }, onlineDot: { width: 8, height: 8, borderRadius: 4 },
  join: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" }, joining: { backgroundColor: colors.softRed }, add: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" },
  accept: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" }, reject: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }
});
