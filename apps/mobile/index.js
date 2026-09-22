import TrackPlayer from "react-native-track-player";
import { LogBox } from "react-native";
import { playbackService } from "./src/playerService";

// Keep development warnings in Metro without covering the player UI on-device.
LogBox.ignoreAllLogs(true);
TrackPlayer.registerPlaybackService(() => playbackService);
import "expo-router/entry";
