import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/context/AuthContext";
import { PlayerProvider } from "../src/context/PlayerContext";
import { LibraryProvider } from "../src/context/LibraryContext";
import { MiniPlayer } from "../src/components/MiniPlayer";
import { PlaylistPicker } from "../src/components/PlaylistPicker";
import { F4WEAlertHost } from "../src/components/F4WEAlert";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";

export default function RootLayout() {
  return <AuthProvider><LibraryProvider><PlayerProvider><StatusBar style="light" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background }, headerShadowVisible: false }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="login" options={{ headerShown: false }} />
    <Stack.Screen name="register" options={{ headerShown: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="profile/requests" options={{ title: "Music Requests" }} />
    <Stack.Screen name="profile/bugs" options={{ title: "Bug Reports" }} />
    <Stack.Screen name="profile/updates" options={{ title: "Update Feed" }} />
    <Stack.Screen name="profile/notifications" options={{ title: "Notifications" }} />
    <Stack.Screen name="profile/staff" options={{ title: "Staff Portal" }} />
    <Stack.Screen name="profile/developer" options={{ title: "Dev Portal" }} />
    <Stack.Screen name="profile/uploader" options={{ title: "Music Uploader" }} />
    <Stack.Screen name="profile/music-manager" options={{ title: "Music Manager" }} />
    <Stack.Screen name="favorites" options={{ title: "Favorites" }} />
    <Stack.Screen name="friends" options={{ title: "Friends" }} />
    <Stack.Screen name="playlist/[id]" options={{ title: "Playlist" }} />
  </Stack><SessionPlayer /><F4WEAlertHost /></PlayerProvider></LibraryProvider></AuthProvider>;
}

function SessionPlayer() { const { user } = useAuth(); return user ? <><MiniPlayer /><PlaylistPicker /></> : null; }
