import { useCallback } from "react";
import { Redirect, Stack, useFocusEffect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { SongRow } from "../src/components/SongRow";
import { Button, Empty, Screen, Title } from "../src/components/UI";
import { useAuth } from "../src/context/AuthContext";
import { useLibrary } from "../src/context/LibraryContext";
import { usePlayer } from "../src/context/PlayerContext";
import { colors } from "../src/lib/theme";

export default function Favorites() {
  const { user, loading } = useAuth(), library = useLibrary(), player = usePlayer();
  useFocusEffect(useCallback(() => { void library.refresh(); }, [library.refresh]));
  if (loading) return <Screen><ActivityIndicator color={colors.accent} /></Screen>;
  if (!user) return <Redirect href="/login" />;
  return <Screen><Stack.Screen options={{ title: "Favorites" }} /><Title subtitle={library.favorites.length + " liked songs"}>Favorites</Title>
    {library.error ? <Text style={{ color: colors.red }}>{library.error}</Text> : null}
    {library.loading ? <ActivityIndicator color={colors.accent} /> : null}
    {library.favorites.length ? <><Button title="Play favorites" icon="play" onPress={() => void player.play(library.favorites[0], library.favorites, { queueControls: true })} /><View style={{ height: 16 }} />{library.favorites.map(song => <SongRow key={song.id} song={song} queue={library.favorites} queueControls />)}</> : !library.loading ? <Empty label="Tap a song's heart to save it here" /> : null}
  </Screen>;
}
