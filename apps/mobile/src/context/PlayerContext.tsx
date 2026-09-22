import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import TrackPlayer, { AndroidAudioContentType, AppKilledPlaybackBehavior, Capability, Event, State, useActiveTrack, usePlaybackState, useProgress, useTrackPlayerEvents, type Track } from "react-native-track-player";
import { API_URL, currentToken } from "../lib/api";
import type { Song } from "../types";
import { useLibrary } from "./LibraryContext";
import { useAuth } from "./AuthContext";
import { F4WEAlert as Alert } from "../components/F4WEAlert";

let ready: Promise<void> | null = null;
function setup() {
  if (!ready) {
    ready = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          // Seconds. Give network interruptions more headroom without changing speed.
          minBuffer: 60, maxBuffer: 120, playBuffer: 5, backBuffer: 15,
          autoHandleInterruptions: true,
          androidAudioContentType: AndroidAudioContentType.Music,
          // iOS needs automatic Now Playing updates for lock-screen and
          // Dynamic Island media controls as tracks advance in the queue.
          // Android uses explicit app metadata so embedded MP3 tags cannot override it.
          autoUpdateMetadata: Platform.OS === "ios"
        });
      }
      catch (error) {
        if ((error as { code?: string })?.code !== "player_already_initialized") throw error;
      }
      await TrackPlayer.updateOptions({
        android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
        capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
        progressUpdateEventInterval: 1
      });
    })().catch(error => { ready = null; throw error; });
  }
  return ready;
}

function streamTrack(song: Song, token: string): Track {
  return {
    id: song.id,
    // Use the API address reachable by this device, not a server localhost URL.
    url: `${API_URL.replace(/\/+$/, "")}/api/music/${encodeURIComponent(song.id)}/stream`,
    title: song.title, artist: song.artist || "Unknown artist", album: "F4WE", description: "F4WE", genre: "F4WE",
    artwork: song.artworkUrl || undefined,
    ...(song.duration && song.duration > 0 ? { duration: song.duration } : {}),
    contentType: "audio/mpeg", headers: { Authorization: `Bearer ${token}` }
  };
}
type PlayerValue = {
  active?: Track; playing: boolean; loading: boolean; error: string | null;
  position: number; duration: number; buffered: number; volume: number;
  play(song: Song, queue?: Song[]): Promise<void>; toggle(): Promise<void>;
  next(): Promise<void>; previous(): Promise<void>; seek(position: number): Promise<void>; setVolume(volume: number): Promise<void>;
  removeQueuedSong(musicId: string): Promise<void>;
  updateSongMetadata(song: Song): Promise<void>;
};
const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { recordPlayed } = useLibrary(); const { user, loading: authLoading } = useAuth();
  const lastRecorded = useRef<string | null>(null), previousUser = useRef<string | undefined>(undefined);
  const active = useActiveTrack();
  const playback = usePlaybackState();
  const progress = useProgress(500);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);
  const volumeRef = useRef(1);
  const [starting, setStarting] = useState(false);
  const [editedMetadata, setEditedMetadata] = useState<Record<string, { title: string; artist: string }>>({});
  const changingTrack = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (!user || (previousUser.current && previousUser.current !== user.id)) {
      void TrackPlayer.reset().catch(() => undefined); lastRecorded.current = null;
      setEditedMetadata({});
    }
    previousUser.current = user?.id;
  }, [user?.id, authLoading]);
  useEffect(() => {
    if (!user || playback.state !== State.Playing || typeof active?.id !== "string") return;
    const key = user.id + ":" + active.id;
    if (lastRecorded.current !== key) { lastRecorded.current = key; recordPlayed(active.id); }
  }, [active?.id, playback.state, user?.id, recordPlayed]);
  useEffect(() => {
    void setup().then(async () => setVolumeState(await TrackPlayer.getVolume())).catch(e => {
      setError(e instanceof Error ? e.message : "Could not initialize the player.");
    });
  }, []);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState !== "active") return;
      // DevTools/reloads can leave Android's native player marked as playing while
      // its audio focus/volume is stale. Re-apply both without restarting the song.
      void setup().then(async () => {
        const current = await TrackPlayer.getPlaybackState();
        if (current.state !== State.Playing) return;
        await TrackPlayer.setVolume(volumeRef.current);
        await TrackPlayer.play();
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);
  useTrackPlayerEvents([Event.PlaybackError], event => {
    setError(`Playback failed: ${event.message || event.code}. Check that the API is running and the music file is available.`);
  });
  const run = async (action: () => Promise<void>) => {
    try { setError(null); await setup(); await action(); }
    catch (e) {
      const message = e instanceof Error ? e.message : "Could not play the song.";
      setError(message); Alert.alert("Player error", message);
    }
  };
  const play = async (song: Song, queue: Song[] = [song]) => {
    if (changingTrack.current) return;
    changingTrack.current = true; setStarting(true);
    try {
      await run(async () => {
        const token = currentToken();
        if (!token) throw new Error("Please sign in again before playing music.");
        const songs = queue.some(item => item.id === song.id) ? queue : [song, ...queue];
        await TrackPlayer.reset();
        await TrackPlayer.add(songs.map(item => streamTrack(item, token)));
        await TrackPlayer.skip(songs.findIndex(item => item.id === song.id));
        await TrackPlayer.updateNowPlayingMetadata({
          title: song.title,
          artist: song.artist || "Unknown artist",
          album: "F4WE",
          description: "F4WE",
          genre: "F4WE",
          artwork: song.artworkUrl || undefined
        });
        await TrackPlayer.setVolume(volume);
        await TrackPlayer.setRate(1);
        await TrackPlayer.play();
      });
    } finally { changingTrack.current = false; setStarting(false); }
  };
  const toggle = () => run(async () => {
    if (changingTrack.current) return;
    if (playback.state === State.Playing) await TrackPlayer.pause();
    else {
      if (playback.state === State.Error) await TrackPlayer.retry();
      if (playback.state === State.Ended) await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
    }
  });
  const next = () => run(async () => {
    if (changingTrack.current) return;
    const [index, queue] = await Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getQueue()]);
    if (index !== undefined && index + 1 < queue.length) await TrackPlayer.skipToNext();
  });
  const previous = () => run(async () => {
    if (changingTrack.current) return;
    const [index, current] = await Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getProgress()]);
    if (current.position > 3 || index === 0) await TrackPlayer.seekTo(0);
    else if (index !== undefined && index > 0) await TrackPlayer.skipToPrevious();
  });
  const seek = (position: number) => run(async () => {
    if (!Number.isFinite(position) || changingTrack.current) return;
    const current = await TrackPlayer.getProgress();
    const duration = current.duration || active?.duration || 0;
    if (duration > 0) await TrackPlayer.seekTo(Math.max(0, Math.min(position, duration)));
  });
  const setVolume = (value: number) => run(async () => {
    if (!Number.isFinite(value)) return;
    const nextVolume = Math.max(0, Math.min(value, 1));
    await TrackPlayer.setVolume(nextVolume); setVolumeState(nextVolume);
  });
  const removeQueuedSong = (musicId: string) => run(async () => {
    const queue = await TrackPlayer.getQueue();
    const indices = queue.flatMap((track, index) => track.id === musicId ? [index] : []);
    if (indices.length) await TrackPlayer.remove(indices);
  });
  const updateSongMetadata = (song: Song) => run(async () => {
    const queue = await TrackPlayer.getQueue();
    for (let index = 0; index < queue.length; index++) {
      if (queue[index].id === song.id) {
        await TrackPlayer.updateMetadataForTrack(index, { title: song.title, artist: song.artist || "Unknown artist", artwork: song.artworkUrl || undefined });
      }
    }
    setEditedMetadata(previous => ({ ...previous, [song.id]: { title: song.title, artist: song.artist || "Unknown artist" } }));
  });
  return <PlayerContext.Provider value={{ active: active ? { ...active, ...(editedMetadata[String(active.id)] || {}) } : active, playing: playback.state === State.Playing,
    loading: starting || playback.state === State.Loading || playback.state === State.Buffering,
    error, ...progress, duration: progress.duration || active?.duration || 0,
    volume, play, toggle, next, previous, seek, setVolume, removeQueuedSong, updateSongMetadata
  }}>{children}</PlayerContext.Provider>;
}
export function usePlayer() { const value = useContext(PlayerContext); if (!value) throw new Error("PlayerProvider missing"); return value; }
