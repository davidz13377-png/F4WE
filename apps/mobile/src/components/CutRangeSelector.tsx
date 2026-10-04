import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

type Props = {
  duration: number;
  start: number;
  end: number;
  position: number;
  previewing: boolean;
  disabled?: boolean;
  onChangeStart(value: number): void;
  onChangeEnd(value: number): void;
  onTogglePreview(): void;
};

const roundTenth = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum));

export function formatCutTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const hours = Math.floor(safe / 3600), minutes = Math.floor((safe % 3600) / 60), seconds = safe % 60;
  const secondsText = seconds.toFixed(1).padStart(4, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsText}` : `${minutes}:${secondsText}`;
}

export function CutRangeSelector({ duration, start, end, position, previewing, disabled, onChangeStart, onChangeEnd, onTogglePreview }: Props) {
  const [trackWidth, setTrackWidth] = useState(1);
  const values = useRef({ duration, start, end, trackWidth, onChangeStart, onChangeEnd });
  const dragBase = useRef(0);
  useEffect(() => { values.current = { duration, start, end, trackWidth, onChangeStart, onChangeEnd }; }, [duration, start, end, trackWidth, onChangeStart, onChangeEnd]);

  const responder = (kind: "start" | "end") => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && values.current.duration > 0,
    onMoveShouldSetPanResponder: () => !disabled && values.current.duration > 0,
    onPanResponderGrant: () => { dragBase.current = kind === "start" ? values.current.start : values.current.end; },
    onPanResponderMove: (_event, gesture) => {
      const current = values.current;
      const moved = dragBase.current + gesture.dx / Math.max(1, current.trackWidth) * current.duration;
      if (kind === "start") current.onChangeStart(roundTenth(clamp(moved, 0, Math.max(0, current.end - 1))));
      else current.onChangeEnd(roundTenth(clamp(moved, Math.min(current.duration, current.start + 1), current.duration)));
    }
  });
  const startResponder = useMemo(() => responder("start"), [disabled]);
  const endResponder = useMemo(() => responder("end"), [disabled]);
  const safeDuration = Math.max(1, duration), startX = start / safeDuration * trackWidth, endX = end / safeDuration * trackWidth;
  const playX = clamp(position, 0, duration) / safeDuration * trackWidth;

  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.raised, padding: 16, marginBottom: 12 }}>
    <View onLayout={event => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))} style={{ height: 48, justifyContent: "center", marginHorizontal: 2 }}>
      <View style={{ height: 5, borderRadius: 99, backgroundColor: "#34343B" }} />
      <View style={{ position: "absolute", left: startX, width: Math.max(0, endX - startX), height: 5, borderRadius: 99, backgroundColor: colors.softRed }} />
      {position > 0 && position <= duration ? <View style={{ position: "absolute", left: clamp(playX - 1, 0, Math.max(0, trackWidth - 2)), width: 2, height: 22, borderRadius: 2, backgroundColor: colors.text }} /> : null}
      <View accessibilityLabel="Cut start" {...startResponder.panHandlers} style={{ position: "absolute", left: clamp(startX - 14, 0, Math.max(0, trackWidth - 28)), width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: colors.text, backgroundColor: colors.softRed }} />
      <View accessibilityLabel="Cut end" {...endResponder.panHandlers} style={{ position: "absolute", left: clamp(endX - 14, 0, Math.max(0, trackWidth - 28)), width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: colors.text, backgroundColor: colors.softRed }} />
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 3 }}>
      <View><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>CUT START</Text><Text style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{formatCutTime(start)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{start.toFixed(1)} seconds</Text></View>
      <View style={{ alignItems: "flex-end" }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>CUT END</Text><Text style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>{formatCutTime(end)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{end.toFixed(1)} seconds</Text></View>
    </View>
    <Pressable disabled={disabled || duration <= 0} onPress={onTogglePreview} style={({ pressed }) => ({ marginTop: 14, minHeight: 46, borderRadius: 14, backgroundColor: colors.text, opacity: disabled || duration <= 0 ? .45 : pressed ? .78 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}>
      <Ionicons name={previewing ? "pause" : "play"} size={20} color={colors.background} />
      <Text style={{ color: colors.background, fontWeight: "900" }}>{previewing ? "Pause preview" : "Play selected range"}</Text>
    </Pressable>
  </View>;
}
