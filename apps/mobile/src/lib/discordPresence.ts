import { NativeModules, Platform } from "react-native";
import type { Track } from "react-native-track-player";

type DiscordPresenceNativeModule = {
  updateActivity(
    title: string,
    artist: string,
    startTimestampSeconds: number,
    endTimestampSeconds: number
  ): Promise<boolean>;
  clearActivity(): Promise<boolean>;
};

const nativeModule = NativeModules.DiscordPresence as DiscordPresenceNativeModule | undefined;

export async function updateDiscordActivity(
  track: Track,
  positionSeconds = 0,
  durationSeconds = 0
) {
  if (Platform.OS !== "android" || !nativeModule) return false;
  const now = Math.floor(Date.now() / 1000);
  const position = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const start = Math.max(1, Math.floor(now - position));
  const end = duration > position ? Math.floor(start + duration) : 0;
  return nativeModule.updateActivity(
    String(track.title || "F4WE Music"),
    String(track.artist || "Unknown artist"),
    start,
    end
  );
}

export async function clearDiscordActivity() {
  if (Platform.OS !== "android" || !nativeModule) return false;
  return nativeModule.clearActivity();
}
