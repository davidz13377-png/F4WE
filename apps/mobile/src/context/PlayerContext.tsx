import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import TrackPlayer, { AndroidAudioContentType, AppKilledPlaybackBehavior, Capability, Event, RepeatMode, State, useActiveTrack, usePlaybackState, useProgress, useTrackPlayerEvents, type Track } from "react-native-track-player";
import { API_URL, api, currentToken } from "../lib/api";
import type { ListeningPresence, Song } from "../types";
import { useLibrary } from "./LibraryContext";
import { useAuth } from "./AuthContext";
import { F4WEAlert as Alert } from "../components/F4WEAlert";

let ready: Promise<void> | null = null;
function setup() {
  if (!ready) {
    ready = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          minBuffer: 60, maxBuffer: 120, playBuffer: 5, backBuffer: 15,
          autoHandleInterruptions: true,
          androidAudioContentType: AndroidAudioContentType.Music,
          autoUpdateMetadata: Platform.OS === "ios"
        });
      } catch (error) {
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
    url: `${API_URL.replace(/\/+$/, "")}/api/music/${encodeURIComponent(song.id)}/stream`,
    title: song.title, artist: song.artist || "Unknown artist", album: "F4WE", description: "F4WE", genre: "F4WE",
    artwork: song.artworkUrl || undefined,
    ...(song.duration && song.duration > 0 ? { duration: song.duration } : {}),
    contentType: "audio/mpeg", headers: { Authorization: `Bearer ${token}` }
  };
}

async function updateNotification(track?: Track) {
  if (!track) return;
  await TrackPlayer.updateNowPlayingMetadata({
    title: track.title || "F4WE", artist: track.artist || "Unknown artist",
    album: "F4WE", description: "F4WE", genre: "F4WE", artwork: track.artwork
  });
}

type PlayOptions = { queueControls?: boolean; following?: boolean };
type PlayerValue = {
  active?: Track; playing: boolean; loading: boolean; error: string | null;
  position: number; duration: number; buffered: number; volume: number;
  shuffle: boolean; repeat: boolean; queueControls: boolean; followingUserId: string | null;
  play(song: Song, queue?: Song[], options?: PlayOptions): Promise<void>; toggle(): Promise<void>;
  next(): Promise<void>; previous(): Promise<void>; seek(position: number): Promise<void>; setVolume(volume: number): Promise<void>;
  toggleShuffle(): Promise<void>; toggleRepeat(): Promise<void>;
  followUser(userId: string): Promise<void>; stopFollowing(): void;
  removeQueuedSong(musicId: string): Promise<void>; updateSongMetadata(song: Song): Promise<void>;
};
const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: PropsWithChildren) {
  const { recordPlayed } = useLibrary();
  const { user, loading: authLoading, socket } = useAuth();
  const lastRecorded = useRef<string | null>(null), previousUser = useRef<string | undefined>(undefined);
  const active = useActiveTrack();
  const activeRef = useRef<Track | undefined>(active);
  const playback = usePlaybackState();
  const progress = useProgress(500);
  const [error, setError] = useState<string | null>(null), [volume, setVolumeState] = useState(1), [starting, setStarting] = useState(false);
  const volumeRef = useRef(1);
  const [shuffle, setShuffle] = useState(false), [repeat, setRepeat] = useState(false), [queueControls, setQueueControls] = useState(false);
  const queueControlsRef = useRef(false), originalQueue = useRef<Song[]>([]);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const followingRef = useRef<string | null>(null);
  const [playSession, setPlaySession] = useState<{ musicId: string; id: string } | null>(null);
  const [editedMetadata, setEditedMetadata] = useState<Record<string, { title: string; artist: string }>>({});
  const changingTrack = useRef(false), durationSent = useRef(new Set<string>()), lastPresenceSent = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { queueControlsRef.current = queueControls; }, [queueControls]);
  useEffect(() => { followingRef.current = followingUserId; }, [followingUserId]);
  useEffect(() => {
    if (authLoading) return;
    if (!user || (previousUser.current && previousUser.current !== user.id)) {
      void TrackPlayer.reset().catch(() => undefined);
      lastRecorded.current = null; setPlaySession(null); setEditedMetadata({}); setFollowingUserId(null);
    }
    previousUser.current = user?.id;
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (!user || playback.state !== State.Playing || typeof active?.id !== "string") return;
    const musicId = String(active.id), key = user.id + ":" + musicId;
    if (lastRecorded.current === key) return;
    lastRecorded.current = key; setPlaySession(null);
    let live = true;
    void recordPlayed(musicId).then(id => { if (live && id && lastRecorded.current === key) setPlaySession({ musicId, id }); });
    return () => { live = false; };
  }, [active?.id, playback.state, user?.id, recordPlayed]);

  useEffect(() => {
    if (!playSession || playback.state !== State.Playing || String(active?.id) !== playSession.musicId) return;
    const timer = setInterval(() => {
      void api(`/api/music/${encodeURIComponent(playSession.musicId)}/play/${encodeURIComponent(playSession.id)}`, {
        method: "PATCH", body: JSON.stringify({ seconds: 10 })
      }).catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [playSession?.id, active?.id, playback.state]);

  useEffect(() => {
    const musicId = typeof active?.id === "string" ? active.id : null, measured = Math.round(progress.duration || 0);
    if (!musicId || measured < 1 || active?.duration || durationSent.current.has(musicId)) return;
    durationSent.current.add(musicId);
    void api(`/api/music/${encodeURIComponent(musicId)}/duration`, { method: "PATCH", body: JSON.stringify({ duration: measured }) }).catch(() => durationSent.current.delete(musicId));
  }, [active?.id, active?.duration, progress.duration]);

  useEffect(() => {
    if (!socket || !active || typeof active.id !== "string") return;
    const now = Date.now(); if (now - lastPresenceSent.current < 1_800) return;
    lastPresenceSent.current = now;
    socket.emit("listening:update", {
      musicId: String(active.id), title: String(active.title || "F4WE"), artist: active.artist ? String(active.artist) : null,
      artworkUrl: active.artwork ? String(active.artwork) : null, position: progress.position, playing: playback.state === State.Playing
    });
  }, [socket, active?.id, active?.title, active?.artist, active?.artwork, progress.position, playback.state]);

  useEffect(() => {
    void setup().then(async () => setVolumeState(await TrackPlayer.getVolume())).catch(e => setError(e instanceof Error ? e.message : "Could not initialize the player."));
  }, []);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState !== "active") return;
      void setup().then(async () => {
        const current = await TrackPlayer.getPlaybackState();
        if (current.state !== State.Playing) return;
        await TrackPlayer.setVolume(volumeRef.current); await TrackPlayer.play();
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  useTrackPlayerEvents([Event.PlaybackError, Event.PlaybackActiveTrackChanged], event => {
    if (event.type === Event.PlaybackError) setError(`Playback failed: ${event.message || event.code}. Check that the API is running and the music file is available.`);
    else if (event.type === Event.PlaybackActiveTrackChanged) void updateNotification(event.track).catch(() => undefined);
  });

  const run = async (action: () => Promise<void>) => {
    try { setError(null); await setup(); await action(); }
    catch (e) { const message = e instanceof Error ? e.message : "Could not play the song."; setError(message); Alert.alert("Player error", message); }
  };
  const leaveFollowing = () => {
    if (followingRef.current) socket?.emit("listening:leave");
    followingRef.current = null; setFollowingUserId(null);
  };

  const play = async (song: Song, queue: Song[] = [song], options: PlayOptions = {}) => {
    if (changingTrack.current) return;
    if (!options.following) leaveFollowing();
    changingTrack.current = true; setStarting(true);
    try {
      await run(async () => {
        const token = currentToken(); if (!token) throw new Error("Please sign in again before playing music.");
        const songs = queue.some(item => item.id === song.id) ? queue : [song, ...queue];
        originalQueue.current = songs;
        setQueueControls(!!options.queueControls); queueControlsRef.current = !!options.queueControls;
        setShuffle(false); setRepeat(false); await TrackPlayer.setRepeatMode(RepeatMode.Off);
        await TrackPlayer.reset(); await TrackPlayer.add(songs.map(item => streamTrack(item, token)));
        await TrackPlayer.skip(songs.findIndex(item => item.id === song.id));
        await updateNotification(streamTrack(song, token));
        await TrackPlayer.setVolume(volumeRef.current); await TrackPlayer.setRate(1); await TrackPlayer.play();
      });
    } finally { changingTrack.current = false; setStarting(false); }
  };

  useEffect(() => {
    if (!socket) return;
    const onState = (state: ListeningPresence & { userId: string }) => {
      if (state.userId !== followingRef.current) return;
      void (async () => {
        const targetPosition = Math.max(0, state.position + (state.playing ? (Date.now() - state.updatedAt) / 1000 : 0));
        if (String(activeRef.current?.id || "") !== state.musicId) {
          const songs = await api<Song[]>(`/api/music?ids=${encodeURIComponent(state.musicId)}`);
          if (!songs[0] || state.userId !== followingRef.current) return;
          await play(songs[0], [songs[0]], { following: true });
        }
        const current = await TrackPlayer.getProgress();
        if (Math.abs(current.position - targetPosition) > 1.25) await TrackPlayer.seekTo(targetPosition);
        const status = await TrackPlayer.getPlaybackState();
        if (state.playing && status.state !== State.Playing) await TrackPlayer.play();
        if (!state.playing && status.state === State.Playing) await TrackPlayer.pause();
      })().catch(e => setError(e instanceof Error ? e.message : "Friend listening sync failed"));
    };
    const unavailable = ({ userId }: { userId: string }) => {
      if (userId !== followingRef.current) return;
      leaveFollowing(); Alert.alert("Listening together ended", "Your friend stopped sharing or went offline.");
    };
    socket.on("listening:state", onState); socket.on("listening:unavailable", unavailable);
    return () => { socket.off("listening:state", onState); socket.off("listening:unavailable", unavailable); };
  }, [socket]);

  const followUser = async (userId: string) => {
    if (!socket?.connected) throw new Error("Realtime connection is not ready. Try again in a moment.");
    followingRef.current = userId; setFollowingUserId(userId);
    await new Promise<void>((resolve, reject) => socket.timeout(8_000).emit("listening:join", userId, (error: Error | null, result?: { ok?: boolean; error?: string }) => {
      if (error || !result?.ok) { followingRef.current = null; setFollowingUserId(null); reject(new Error(result?.error || "Could not join your friend")); }
      else resolve();
    }));
  };

  const toggle = () => run(async () => {
    leaveFollowing(); if (changingTrack.current) return;
    if (playback.state === State.Playing) await TrackPlayer.pause();
    else { if (playback.state === State.Error) await TrackPlayer.retry(); if (playback.state === State.Ended) await TrackPlayer.seekTo(0); await TrackPlayer.play(); }
  });
  const next = () => run(async () => {
    leaveFollowing(); if (changingTrack.current) return;
    const [index, queue] = await Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getQueue()]);
    if (index !== undefined && index + 1 < queue.length) await TrackPlayer.skipToNext();
  });
  const previous = () => run(async () => {
    leaveFollowing(); if (changingTrack.current) return;
    const [index, current] = await Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getProgress()]);
    if (current.position > 3 || index === 0) await TrackPlayer.seekTo(0); else if (index !== undefined && index > 0) await TrackPlayer.skipToPrevious();
  });
  const seek = (position: number) => run(async () => {
    leaveFollowing(); if (!Number.isFinite(position) || changingTrack.current) return;
    const current = await TrackPlayer.getProgress(), duration = current.duration || activeRef.current?.duration || 0;
    if (duration > 0) await TrackPlayer.seekTo(Math.max(0, Math.min(position, duration)));
  });
  const setVolume = (value: number) => run(async () => {
    if (!Number.isFinite(value)) return;
    const nextVolume = Math.max(0, Math.min(value, 1)); await TrackPlayer.setVolume(nextVolume); setVolumeState(nextVolume);
  });
  const toggleShuffle = () => run(async () => {
    if (!queueControlsRef.current || changingTrack.current) return;
    const token = currentToken(); if (!token) throw new Error("Please sign in again.");
    const currentId = String((await TrackPlayer.getActiveTrack())?.id || ""), current = await TrackPlayer.getProgress(), state = await TrackPlayer.getPlaybackState();
    const enable = !shuffle; let songs = [...originalQueue.current];
    if (enable) {
      const rest = songs.filter(song => song.id !== currentId);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      const selected = songs.find(song => song.id === currentId); songs = selected ? [selected, ...rest] : rest;
    }
    await TrackPlayer.setQueue(songs.map(song => streamTrack(song, token)));
    const index = Math.max(0, songs.findIndex(song => song.id === currentId));
    await TrackPlayer.skip(index, current.position); if (state.state === State.Playing) await TrackPlayer.play(); setShuffle(enable);
  });
  const toggleRepeat = () => run(async () => { const enable = !repeat; await TrackPlayer.setRepeatMode(enable ? RepeatMode.Track : RepeatMode.Off); setRepeat(enable); });
  const removeQueuedSong = (musicId: string) => run(async () => {
    originalQueue.current = originalQueue.current.filter(song => song.id !== musicId);
    const queue = await TrackPlayer.getQueue(), indices = queue.flatMap((track, index) => track.id === musicId ? [index] : []);
    if (indices.length) await TrackPlayer.remove(indices);
  });
  const updateSongMetadata = (song: Song) => run(async () => {
    const queue = await TrackPlayer.getQueue();
    for (let index = 0; index < queue.length; index++) if (queue[index].id === song.id) await TrackPlayer.updateMetadataForTrack(index, { title: song.title, artist: song.artist || "Unknown artist", artwork: song.artworkUrl || undefined });
    if (String(activeRef.current?.id) === song.id) await updateNotification({ ...activeRef.current!, title: song.title, artist: song.artist || "Unknown artist", artwork: song.artworkUrl || undefined });
    originalQueue.current = originalQueue.current.map(item => item.id === song.id ? song : item);
    setEditedMetadata(previous => ({ ...previous, [song.id]: { title: song.title, artist: song.artist || "Unknown artist" } }));
  });

  return <PlayerContext.Provider value={{
    active: active ? { ...active, ...(editedMetadata[String(active.id)] || {}) } : active,
    playing: playback.state === State.Playing, loading: starting || playback.state === State.Loading || playback.state === State.Buffering,
    error, ...progress, duration: progress.duration || active?.duration || 0, volume,
    shuffle, repeat, queueControls, followingUserId,
    play, toggle, next, previous, seek, setVolume, toggleShuffle, toggleRepeat, followUser, stopFollowing: leaveFollowing, removeQueuedSong, updateSongMetadata
  }}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext); if (!value) throw new Error("PlayerProvider missing"); return value;
}
