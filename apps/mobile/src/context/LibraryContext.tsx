import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { api } from "../lib/api";
import { historyFor } from "../lib/history";
import type { HistoryEntry, Playlist, Song } from "../types";
import { useAuth } from "./AuthContext";

type LibraryValue = {
  favorites: Song[]; playlists: Playlist[]; recent: HistoryEntry[]; loading: boolean; error: string;
  refresh(): Promise<void>; toggleFavorite(song: Song): Promise<void>; isFavorite(song: Song): boolean;
  toggleSaved(playlist: Playlist): Promise<void>; selectedSong: Song | null; choosePlaylist(song: Song): void; closePicker(): void;
  recordPlayed(musicId: string): Promise<string | null>; forgetSong(musicId: string): Promise<void>;
};
const Context = createContext<LibraryValue | null>(null);
export function LibraryProvider({ children }: PropsWithChildren) {
  const { user } = useAuth(); const userId = user?.id;
  const currentUser = useRef(userId); currentUser.current = userId;
  const request = useRef(0), favoritesRef = useRef<Song[]>([]), mutations = useRef(new Set<string>());
  const bootstrapFavorites = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const [favorites, setFavorites] = useState<Song[]>([]), [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false), [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const revision = ++request.current; setLoading(true); setError("");
    try {
      const [songs, lists] = await Promise.all([api<Song[]>("/api/music/favorites"), api<Playlist[]>("/api/playlists?library=true")]);
      if (currentUser.current !== userId || request.current !== revision) return;
      favoritesRef.current = songs; setFavorites(songs); setPlaylists(lists); setHydrated(true);
    } catch (e) { if (currentUser.current === userId && request.current === revision) setError(e instanceof Error ? e.message : "Could not load your library"); }
    finally { if (currentUser.current === userId && request.current === revision) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    ++request.current; bootstrapFavorites.current = null; favoritesRef.current = []; setFavorites([]); setPlaylists([]); setRecent([]); setHydrated(false); setSelectedSong(null); setError(""); setLoading(false);
    if (!userId) return;
    void refresh();
    void historyFor(userId).then(items => { if (currentUser.current === userId) setRecent(items); }).catch(() => undefined);
  }, [userId, refresh]);
  const toggleFavorite = async (song: Song) => {
    if (!userId || mutations.current.has(`${userId}:like:${song.id}`)) return;
    const key = `${userId}:like:${song.id}`; mutations.current.add(key);
    try {
      ++request.current;
      if (!hydrated) {
        if (bootstrapFavorites.current?.userId !== userId) {
          const promise = api<Song[]>("/api/music/favorites").then(songs => {
            if (currentUser.current !== userId) return;
            favoritesRef.current = songs; setFavorites(songs); setHydrated(true);
          });
          bootstrapFavorites.current = { userId, promise };
          void promise.catch(() => { if (bootstrapFavorites.current?.promise === promise) bootstrapFavorites.current = null; });
        }
        await bootstrapFavorites.current.promise;
        if (currentUser.current !== userId) return;
      }
      const liked = favoritesRef.current.some(item => item.id === song.id);
      await api(`/api/music/${encodeURIComponent(song.id)}/like`, { method: liked ? "DELETE" : "POST" });
      if (currentUser.current !== userId) return;
      ++request.current;
      const next = liked ? favoritesRef.current.filter(item => item.id !== song.id) : [{ ...song, liked: true }, ...favoritesRef.current.filter(item => item.id !== song.id)];
      favoritesRef.current = next; setFavorites(next); setLoading(false);
    } finally { mutations.current.delete(key); if (currentUser.current === userId) setLoading(false); }
  };
  const toggleSaved = async (playlist: Playlist) => {
    const key = `${userId}:save:${playlist.id}`;
    if (!userId || mutations.current.has(key)) return;
    mutations.current.add(key);
    try { await api(`/api/playlists/${encodeURIComponent(playlist.id)}/save`, { method: playlist.saved ? "DELETE" : "POST" }); await refresh(); }
    finally { mutations.current.delete(key); }
  };
  const record = useCallback((entry: HistoryEntry) => {
    if (!userId) return;
    void historyFor(userId, entry).then(items => { if (currentUser.current === userId) setRecent(items); }).catch(() => undefined);
  }, [userId]);
  const recordPlayed = useCallback(async (musicId: string) => {
    record({ kind: "song", musicId, at: Date.now() });
    try {
      const result = await api<{ id: string }>(`/api/music/${encodeURIComponent(musicId)}/play`, { method: "POST" });
      return result.id;
    } catch { return null; }
  }, [record]);
  const forgetSong = async (musicId: string) => {
    favoritesRef.current = favoritesRef.current.filter(song => song.id !== musicId); setFavorites(favoritesRef.current);
    if (userId) { const items = await historyFor(userId, undefined, musicId); if (currentUser.current === userId) setRecent(items); }
    await refresh();
  };
  return <Context.Provider value={{ favorites, playlists, recent, loading, error, refresh, toggleFavorite,
    isFavorite: song => hydrated ? favorites.some(item => item.id === song.id) : !!song.liked,
    toggleSaved, selectedSong, choosePlaylist: setSelectedSong, closePicker: () => setSelectedSong(null), recordPlayed, forgetSong }}>{children}</Context.Provider>;
}
export function useLibrary() { const value = useContext(Context); if (!value) throw new Error("LibraryProvider missing"); return value; }
