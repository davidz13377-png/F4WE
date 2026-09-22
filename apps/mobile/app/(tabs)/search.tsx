import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { SongRow } from "../../src/components/SongRow";
import { PlaylistRow } from "../../src/components/PlaylistRow";
import { Empty, Input, Screen, Title, ui } from "../../src/components/UI";
import { useLibrary } from "../../src/context/LibraryContext";
import { api } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import type { Song, Playlist } from "../../src/types";

export default function Search() {
  const library = useLibrary();
  const [query, setQuery] = useState(""), [songs, setSongs] = useState<Song[]>([]), [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => { void library.refresh(); setRevision(v => v + 1); }, [library.refresh]));
  const ids = library.recent.map(item => item.musicId).join(",");
  useEffect(() => {
    let live = true;
    if (!ids) { setRecentSongs([]); return; }
    void api<Song[]>("/api/music?ids=" + encodeURIComponent(ids)).then(items => { if (live) setRecentSongs(items); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [ids, revision]);
  useEffect(() => {
    let live = true; setError(""); setSongs([]); setPlaylists([]);
    const clean = query.trim(); setLoading(!!clean);
    if (!clean) return;
    const timer = setTimeout(() => {
      void Promise.all([api<Song[]>("/api/music?q=" + encodeURIComponent(clean)), api<Playlist[]>("/api/playlists?q=" + encodeURIComponent(clean))])
        .then(([tracks, lists]) => { if (live) { setSongs(tracks); setPlaylists(lists); } })
        .catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query, revision]);
  const recentQueue = library.recent.flatMap(item => recentSongs.filter(song => song.id === item.musicId));
  return <Screen><Title subtitle="Find songs, artists and community playlists in F4WE.">Search</Title>
    <Input value={query} maxLength={100} onChangeText={setQuery} placeholder="Songs, artists or playlists" returnKeyType="search" />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text> : null}
    {!query.trim() ? <>
      <Text style={ui.section}>Recently played</Text>
      {library.recent.map(item => recentSongs.find(song => song.id === item.musicId) ? <SongRow key={"song:" + item.musicId} song={recentSongs.find(song => song.id === item.musicId)!} queue={recentQueue} /> : null)}
      {!library.recent.length ? <Empty label="Your last 10 played songs will appear here" /> : null}
    </> : <>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {songs.length ? <><Text style={ui.section}>Songs</Text>{songs.map(song => <SongRow key={song.id} song={song} queue={songs} />)}</> : null}
      {playlists.length ? <><Text style={ui.section}>Playlists</Text>{playlists.map(list => <PlaylistRow key={list.id} playlist={list} onSaved={() => setRevision(v => v + 1)} />)}</> : null}
      {!loading && !error && !songs.length && !playlists.length ? <Empty label="No matching songs or playlists" /> : null}
    </>}
  </Screen>;
}
