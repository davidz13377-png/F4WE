import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Redirect, router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { OwnerBadge, RankBadge, Screen, ui } from "../../src/components/UI";
import { ProfilePicture } from "../../src/components/ProfilePicture";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/lib/api";
import { profilePictureUrl } from "../../src/lib/media";
import { colors } from "../../src/lib/theme";
import { compactDuration } from "../../src/lib/time";
import type { PublicProfile } from "../../src/types";

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id: string }>(), id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useFocusEffect(useCallback(() => { let live = true; setLoading(true); setError(""); void api<PublicProfile>(`/api/profile/users/${encodeURIComponent(id || "")}`).then(value => { if (live) setProfile(value); }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not open profile"); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [id]));
  if (authLoading) return <Screen><ActivityIndicator color={colors.accent} /></Screen>;
  if (!user) return <Redirect href="/login" />;
  return <Screen><Stack.Screen options={{ title: profile?.username || "Profile" }} />
    {loading ? <ActivityIndicator color={colors.accent} /> : null}{error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    {profile ? <><View style={styles.card}><View style={styles.banner}>{profile.bannerUrl ? <Image source={{ uri: profilePictureUrl(profile.bannerUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View><View style={styles.body}><View style={styles.avatar}><ProfilePicture user={profile} size={88} openProfile={false} /></View><Text style={styles.name}>{profile.username}</Text><View style={[ui.row, { gap: 8, justifyContent: "center" }]}>{profile.isOwner ? <OwnerBadge /> : null}<RankBadge rank={profile.rank} /></View></View></View>
      <Text style={ui.section}>Public playlists</Text>{profile.playlists.map(playlist => <Pressable key={playlist.id} style={styles.playlist} onPress={() => router.push(`/playlist/${playlist.id}` as any)}><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: "900" }]}>{playlist.name}</Text><Text style={ui.muted}>{playlist.trackCount} songs • {compactDuration(playlist.totalDuration)}</Text></View><Text style={{ color: colors.accent }}>Open</Text></Pressable>)}{!profile.playlists.length ? <Text style={ui.muted}>No public playlists yet.</Text> : null}
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({ card: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, banner: { height: 150, backgroundColor: "#3A1117" }, body: { alignItems: "center", paddingBottom: 22 }, avatar: { marginTop: -58 }, name: { color: colors.text, fontSize: 27, fontWeight: "900", marginVertical: 8 }, playlist: { minHeight: 70, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: colors.border, gap: 12 } });
