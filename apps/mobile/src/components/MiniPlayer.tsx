import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";
import { usePlayer } from "../context/PlayerContext";
import { api } from "../lib/api";

function time(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function MiniPlayer() {
  const player = usePlayer();
  const params = useGlobalSearchParams<{ openPlayer?: string | string[] }>();
  const openPlayer = Array.isArray(params.openPlayer) ? params.openPlayer[0] : params.openPlayer;
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [lyrics, setLyrics] = useState<{ type: "plain" | "timed"; content: string } | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const lyricsScroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useEffect(() => { setPreview(null); }, [player.active?.id]);
  useEffect(() => { if (openPlayer) setExpanded(true); }, [openPlayer]);
  useEffect(() => {
    let live = true; setLyrics(null);
    if (!expanded || !player.active?.id) return;
    setLyricsLoading(true);
    void api<{ type: "plain" | "timed"; content: string }>(`/api/music/${encodeURIComponent(String(player.active.id))}/lyrics`)
      .then(value => { if (live) setLyrics(value); }).catch(() => { if (live) setLyrics(null); }).finally(() => { if (live) setLyricsLoading(false); });
    return () => { live = false; };
  }, [expanded, player.active?.id]);
  const active = player.active;
  const timedLines = lyrics?.type === "timed" ? parseLrc(lyrics.content) : [];
  const currentLine = timedLines.reduce((found, line, index) => line.time <= player.position ? index : found, -1);
  useEffect(() => {
    if (currentLine < 0) return;
    lyricsScroll.current?.scrollTo({ y: Math.max(0, currentLine * 38 - 100), animated: true });
  }, [currentLine, active?.id]);
  if (!active) return null;
  const artworkSize = Math.min(width - 56, 350);
  const progress = player.duration > 0 ? Math.min(1, player.position / player.duration) : 0;
  const displayPosition = preview ?? player.position;
  return <>
    <View style={styles.wrap}>
      <Pressable onPress={() => setExpanded(true)} style={styles.summary} accessibilityRole="button" accessibilityLabel={`Open player for ${active.title}`}>
        {active.artwork ? <Image source={{ uri: active.artwork }} style={styles.art} /> : <View style={[styles.art, styles.fallback]}><Ionicons name="musical-note" size={24} color={colors.accent} /></View>}
        <View style={styles.songText}>
          <Text numberOfLines={1} style={styles.title}>{active.title}</Text>
          <Text numberOfLines={1} style={[styles.artist, player.error ? styles.errorText : null]}>{player.error ? "Playback failed — tap for details" : player.loading ? "Loading music…" : active.artist}</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => void player.toggle()} style={styles.miniControl} accessibilityRole="button" accessibilityLabel={player.playing ? "Pause" : "Play"} disabled={player.loading}>
        {player.loading ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name={player.playing ? "pause" : "play"} size={28} color={colors.text} />}
      </Pressable>
      <Pressable onPress={() => void player.next()} style={styles.miniControl} accessibilityRole="button" accessibilityLabel="Next song">
        <Ionicons name="play-skip-forward" size={23} color={colors.text} />
      </Pressable>
      <View pointerEvents="none" style={styles.miniProgress}><View style={[styles.miniProgressFill, { width: `${progress * 100}%` }]} /></View>
    </View>
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
      <LinearGradient colors={["#3A3D43", "#17191D", colors.background]} style={styles.full}>
        <ScrollView contentContainerStyle={[styles.fullContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => setExpanded(false)} style={styles.control} accessibilityRole="button" accessibilityLabel="Close player">
              <Ionicons name="chevron-down" size={30} color={colors.text} />
            </Pressable>
            <View style={styles.headerText}><Text style={styles.eyebrow}>NOW PLAYING</Text><Text style={styles.headerTitle}>F4WE</Text></View>
            <View style={styles.control} />
          </View>
          <View style={[styles.largeArt, { width: artworkSize, height: artworkSize }]}>
            {active.artwork ? <Image source={{ uri: active.artwork }} style={styles.artImage} resizeMode="cover" /> : <Ionicons name="musical-notes" size={Math.round(artworkSize * 0.3)} color={colors.accent} />}
          </View>
          <View style={styles.trackInfo}>
            <Text numberOfLines={2} style={styles.largeTitle}>{active.title}</Text>
            <Text style={styles.largeArtist}>{active.artist}</Text>
          </View>
          {player.error ? <Text accessibilityRole="alert" style={styles.errorBox}>{player.error}</Text> : null}
          {player.loading ? <Text style={styles.status}>Loading music…</Text> : null}
          <SeekBar key={String(active.id)} value={displayPosition} maximum={player.duration} buffered={player.buffered} label="Song position"
            valueText={`${time(displayPosition)} of ${time(player.duration)}`} step={5}
            onPreview={setPreview} onCancel={() => setPreview(null)}
            onCommit={value => { void player.seek(value).finally(() => setPreview(null)); }} />
          <View style={styles.times}><Text style={styles.time}>{time(displayPosition)}</Text><Text style={styles.time}>{time(player.duration)}</Text></View>
          <View style={styles.transport}>
            {player.queueControls ? <Pressable onPress={() => void player.toggleShuffle()} style={styles.control} accessibilityRole="button" accessibilityLabel={player.shuffle ? "Turn shuffle off" : "Turn shuffle on"}>
              <Ionicons name="shuffle" size={25} color={player.shuffle ? colors.softRed : colors.muted} />
            </Pressable> : <View style={styles.control} />}
            <Pressable onPress={() => void player.previous()} style={styles.control} accessibilityRole="button" accessibilityLabel="Previous song">
              <Ionicons name="play-skip-back" size={34} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => void player.toggle()} style={styles.playButton} accessibilityRole="button" accessibilityLabel={player.playing ? "Pause" : "Play"} disabled={player.loading}>
              {player.loading ? <ActivityIndicator size="large" color={colors.background} /> : <Ionicons name={player.playing ? "pause" : "play"} size={38} color={colors.background} style={!player.playing ? { marginLeft: 4 } : undefined} />}
            </Pressable>
            <Pressable onPress={() => void player.next()} style={styles.control} accessibilityRole="button" accessibilityLabel="Next song">
              <Ionicons name="play-skip-forward" size={34} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => void player.toggleRepeat()} style={styles.control} accessibilityRole="button" accessibilityLabel={player.repeat ? "Turn song repeat off" : "Repeat this song"}>
              <Ionicons name="repeat" size={25} color={player.repeat ? colors.softRed : colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Drag the timeline or tap it to jump to any moment.</Text>
          <View style={styles.lyricsCard}>
            <View style={styles.lyricsHeader}><Text style={styles.lyricsTitle}>Lyrics</Text>{lyrics?.type === "timed" ? <Text style={styles.syncedBadge}>SYNCED</Text> : null}</View>
            {lyricsLoading ? <ActivityIndicator color={colors.softRed} /> : lyrics?.type === "plain" ? <Text style={styles.plainLyrics}>{lyrics.content}</Text> : timedLines.length ? <ScrollView ref={lyricsScroll} style={styles.lyricsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {timedLines.map((line, index) => <Text key={`${line.time}:${index}`} style={[styles.lyricLine, index === currentLine ? styles.lyricActive : null]}>{line.text || "♪"}</Text>)}
            </ScrollView> : <Text style={styles.noLyrics}>Lyrics have not been added for this song yet.</Text>}
          </View>
        </ScrollView>
      </LinearGradient>
    </Modal>
  </>;
}

function parseLrc(content: string) {
  const lines: { time: number; text: string }[] = [];
  for (const row of content.split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text = row.replace(/\[[^\]]+\]/g, "").trim();
    for (const tag of tags) {
      const fraction = tag[3] ? Number(`0.${tag[3].padEnd(3, "0").slice(0, 3)}`) : 0;
      lines.push({ time: Number(tag[1]) * 60 + Number(tag[2]) + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

type SeekBarProps = {
  value: number; maximum: number; buffered?: number; label: string; valueText: string; step: number;
  onPreview?(value: number): void; onCancel?(): void; onCommit(value: number): void;
};
// Pure React Native slider: no additional native package or Android rebuild.
function SeekBar(props: SeekBarProps) {
  const width = useRef(0);
  const startX = useRef(0);
  const lastValue = useRef(props.value);
  const latest = useRef(props);
  latest.current = props;
  const [draft, setDraft] = useState<number | null>(null);
  const responders = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.maximum > 0,
    onMoveShouldSetPanResponder: () => latest.current.maximum > 0,
    onPanResponderGrant: event => {
      startX.current = event.nativeEvent.locationX;
      const value = sliderValue(startX.current, width.current, latest.current.maximum);
      lastValue.current = value; setDraft(value); latest.current.onPreview?.(value);
    },
    onPanResponderMove: (_event, gesture) => {
      const value = sliderValue(startX.current + gesture.dx, width.current, latest.current.maximum);
      lastValue.current = value; setDraft(value); latest.current.onPreview?.(value);
    },
    onPanResponderRelease: () => {
      setDraft(null); latest.current.onCommit(lastValue.current);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { setDraft(null); latest.current.onCancel?.(); }
  })).current;
  const displayed = draft ?? props.value;
  const fraction = props.maximum > 0 ? Math.max(0, Math.min(1, displayed / props.maximum)) : 0;
  const buffered = props.maximum > 0 ? Math.max(0, Math.min(1, (props.buffered || 0) / props.maximum)) : 0;
  return <View {...responders.panHandlers} onLayout={event => { width.current = event.nativeEvent.layout.width; }}
    style={styles.seekTouch} accessible accessibilityRole="adjustable" accessibilityLabel={props.label}
    accessibilityValue={{ min: 0, max: props.maximum, now: displayed, text: props.valueText }}
    accessibilityState={{ disabled: props.maximum <= 0 }}
    accessibilityActions={[{ name: "increment", label: "Increase" }, { name: "decrement", label: "Decrease" }]}
    onAccessibilityAction={event => {
      if (props.maximum <= 0) return;
      const delta = event.nativeEvent.actionName === "increment" ? props.step : -props.step;
      props.onCommit(Math.max(0, Math.min(props.maximum, props.value + delta)));
    }}>
    <View pointerEvents="none" style={styles.seekTrack}>
      <View style={[styles.buffered, { width: `${buffered * 100}%` }]} />
      <View style={[styles.seekFill, { width: `${fraction * 100}%` }]} />
      <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
    </View>
  </View>;
}
function sliderValue(x: number, width: number, maximum: number) {
  return width > 0 && maximum > 0 ? Math.max(0, Math.min(1, x / width)) * maximum : 0;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 8, right: 8, bottom: 64, height: 68, borderRadius: 12, backgroundColor: "#1B1D21", borderWidth: 1, borderColor: "#363A41", flexDirection: "row", alignItems: "center", paddingHorizontal: 6, zIndex: 50, overflow: "hidden" },
  summary: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, minHeight: 56 },
  art: { width: 46, height: 46, borderRadius: 8 },
  fallback: { backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" },
  songText: { flex: 1 }, title: { color: colors.softRed, fontWeight: "800" },
  artist: { color: colors.muted, fontSize: 12, marginTop: 3 },
  miniControl: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  miniProgress: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "#484C53" },
  miniProgressFill: { height: 3, backgroundColor: colors.accent },
  full: { flex: 1 }, fullContent: { flexGrow: 1, paddingHorizontal: 28 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  headerText: { flex: 1, alignItems: "center" },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  headerTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 4 },
  control: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  largeArt: { alignSelf: "center", borderRadius: 18, backgroundColor: "#1B1D21", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 28 },
  artImage: { width: "100%", height: "100%" },
  trackInfo: { marginBottom: 16 }, largeTitle: { color: colors.softRed, fontSize: 25, fontWeight: "800" },
  largeArtist: { color: colors.muted, fontSize: 16, marginTop: 7 },
  seekTouch: { height: 44, justifyContent: "center" },
  seekTrack: { height: 5, borderRadius: 4, backgroundColor: "#454950" },
  seekFill: { position: "absolute", height: 5, backgroundColor: colors.accent, borderRadius: 4 },
  buffered: { position: "absolute", height: 5, backgroundColor: "#777B82", borderRadius: 4 },
  thumb: { position: "absolute", top: -5, width: 15, height: 15, marginLeft: -7.5, borderRadius: 8, backgroundColor: colors.text },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: -3 },
  time: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 22 },
  playButton: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 2 },
  lyricsCard: { marginTop: 34, borderRadius: 20, backgroundColor: "#17191DEB", borderWidth: 1, borderColor: colors.border, padding: 18, minHeight: 180 },
  lyricsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  lyricsTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  syncedBadge: { color: colors.softRed, borderColor: colors.softRed, borderWidth: 1, borderRadius: 99, fontSize: 10, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 4 },
  lyricsScroll: { maxHeight: 320 }, plainLyrics: { color: colors.text, fontSize: 18, lineHeight: 30 },
  lyricLine: { color: "#7D8087", fontSize: 19, fontWeight: "700", lineHeight: 30, paddingVertical: 4 },
  lyricActive: { color: colors.softRed, fontSize: 21 }, noLyrics: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  errorText: { color: "#FFA9A3" }, errorBox: { color: "#FFA9A3", backgroundColor: "#3B2121", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 8 },
  status: { color: colors.muted, fontSize: 12, marginBottom: 5 }
});
