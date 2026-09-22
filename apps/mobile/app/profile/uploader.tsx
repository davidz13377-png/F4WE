import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Input, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { uploadForm } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";

export default function Uploader() {
  const { user } = useAuth(); const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null); const [title, setTitle] = useState(""); const [artist, setArtist] = useState(""); const [artworkUrl, setArtwork] = useState(""); const [busy, setBusy] = useState(false);
  if (!user || (user.rank === "Access" && !user.isOwner)) return <Redirect href="/(tabs)/profile" />;
  const choose = async () => { const result = await DocumentPicker.getDocumentAsync({ type: "audio/mpeg", copyToCacheDirectory: true }); if (!result.canceled) setFile(result.assets[0]); };
  const upload = async () => {
    if (!file) return Alert.alert("Choose an MP3 first");
    if (busy) return;
    try {
      setBusy(true);
      const form = new FormData();
      form.append("title", title);
      if (artist) form.append("artist", artist);
      if (artworkUrl) form.append("artworkUrl", artworkUrl);
      // Expo fetch accepts File/Blob parts, not legacy React Native URI objects.
      form.append("file", new File(file.uri));
      await uploadForm("/api/music/upload", form);
      setFile(null);
      setTitle("");
      setArtist("");
      setArtwork("");
      Alert.alert("Uploaded", "The song is now in the F4WE library.");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };
  return <Screen><Title subtitle="Only valid MP3 files are accepted. The server checks file contents, not only the extension.">Music Uploader</Title><PressableCard onPress={() => void choose()} fileName={file?.name} /><View style={{ height: 16 }} /><Input placeholder="Song title" value={title} onChangeText={setTitle} /><Input placeholder="Artist (optional)" value={artist} onChangeText={setArtist} /><Input placeholder="Artwork URL (optional)" autoCapitalize="none" value={artworkUrl} onChangeText={setArtwork} /><Button title="Upload" icon="cloud-upload" loading={busy} onPress={() => void upload()} /></Screen>;
}

function PressableCard({ onPress, fileName }: { onPress(): void; fileName?: string }) { return <Pressable onPress={onPress}><Card><View style={{ alignItems: "center", paddingVertical: 22 }}><Text style={{ color: colors.accent, fontSize: 34 }}>♫</Text><Text style={[ui.body, { fontWeight: "800", marginTop: 8 }]}>{fileName || "Choose MP3 file"}</Text><Text style={[ui.muted, { marginTop: 5 }]}>Tap to browse</Text></View></Card></Pressable>; }
