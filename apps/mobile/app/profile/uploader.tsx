import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { Button, Card, Input, Screen, Title, ui } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { api, uploadFile } from "../../src/lib/api";
import { colors } from "../../src/lib/theme";
import { F4WEAlert as Alert } from "../../src/components/F4WEAlert";
import type { Song } from "../../src/types";

export default function Uploader() {
  const { user } = useAuth();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null), [artwork, setArtwork] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [lyricsFile, setLyricsFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null), [lyricsType, setLyricsType] = useState<"timed" | "plain">("timed");
  const [title, setTitle] = useState(""), [artist, setArtist] = useState(""), [busy, setBusy] = useState(false);
  if (!user || (user.rank === "Access" && !user.isOwner)) return <Redirect href="/(tabs)/profile" />;
  const choose = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/mpeg", copyToCacheDirectory: true });
    if (!result.canceled) {
      const selected = result.assets[0];
      setFile(selected);
      if (!title.trim()) setTitle(selected.name.replace(/\.mp3$/i, ""));
    }
  };
  const chooseArtwork = async () => {
    if (Platform.OS === "ios") { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return Alert.alert("Photo permission needed"); }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .85 });
    if (!result.canceled && result.assets[0]) {
      if (result.assets[0].fileSize && result.assets[0].fileSize! > 5 * 1024 * 1024) return Alert.alert("Image too large", "Choose an image smaller than 5 MB.");
      setArtwork(result.assets[0]);
    }
  };
  const chooseLyrics = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0], expected = lyricsType === "timed" ? ".lrc" : ".txt";
    if (!asset.name.toLowerCase().endsWith(expected)) return Alert.alert("Wrong lyrics file", `Choose a ${expected} file for this mode.`);
    if (asset.size && asset.size > 100_000) return Alert.alert("Lyrics file too large", "The maximum size is 100 KB.");
    setLyricsFile(asset);
  };
  const upload = async () => {
    if (!file) return Alert.alert("Choose an MP3 first");
    if (busy) return;
    try {
      setBusy(true);
      if (!title.trim()) throw new Error("Enter the song title.");
      const song = await uploadFile<Song>("/api/music/upload", { uri: file.uri, name: file.name || "upload.mp3", type: file.mimeType || "audio/mpeg", size: file.size }, { title: title.trim(), ...(artist.trim() ? { artist: artist.trim() } : {}) });
      const warnings: string[] = [];
      if (artwork) {
        try { await uploadFile(`/api/music/${encodeURIComponent(song.id)}/picture`, { uri: artwork.uri, name: artwork.fileName || "artwork.jpg", type: artwork.mimeType || "image/jpeg", size: artwork.fileSize }); }
        catch { warnings.push("The song uploaded, but its artwork could not be saved."); }
      }
      if (lyricsFile) {
        try {
          const content = await new File(lyricsFile.uri).text();
          await api(`/api/music/${encodeURIComponent(song.id)}/lyrics`, { method: "PUT", body: JSON.stringify({ type: lyricsType, content }) });
        } catch { warnings.push("The song uploaded, but its lyrics could not be saved."); }
      }
      setFile(null); setArtwork(null); setLyricsFile(null); setTitle(""); setArtist("");
      Alert.alert("Uploaded", warnings.length ? warnings.join("\n") : "The song, artwork and lyrics are now in the F4WE library.");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };
  return <Screen><Title subtitle="Choose an MP3, optional cover image and optional lyrics directly from your phone.">Music Uploader</Title><PressableCard onPress={() => void choose()} fileName={file?.name} /><View style={{ height: 16 }} /><Input placeholder="Song title" value={title} onChangeText={setTitle} /><Input placeholder="Artist (optional)" value={artist} onChangeText={setArtist} />
    <Text style={ui.label}>Song artwork</Text><Pressable onPress={() => void chooseArtwork()}><Card><View style={{ alignItems: "center", paddingVertical: 10 }}>{artwork ? <Image source={{ uri: artwork.uri }} style={{ width: 130, height: 130, borderRadius: 14 }} /> : <><Text style={{ color: colors.softRed, fontSize: 30 }}>▧</Text><Text style={[ui.body, { fontWeight: "800", marginTop: 7 }]}>Choose image from phone</Text></>}</View></Card></Pressable>
    <Text style={ui.label}>Lyrics (optional)</Text><View style={{ flexDirection: "row", backgroundColor: colors.raised, borderRadius: 14, padding: 4, marginBottom: 10 }}><Mode label="Timed .lrc" selected={lyricsType === "timed"} onPress={() => { setLyricsType("timed"); setLyricsFile(null); }} /><Mode label="Plain .txt" selected={lyricsType === "plain"} onPress={() => { setLyricsType("plain"); setLyricsFile(null); }} /></View>
    <Button title={lyricsFile?.name || `Choose ${lyricsType === "timed" ? ".lrc" : ".txt"} file`} icon="document-text-outline" tone="dark" onPress={() => void chooseLyrics()} /><View style={{ height: 18 }} />
    <Button title="Upload" icon="cloud-upload" loading={busy} onPress={() => void upload()} /></Screen>;
}

function PressableCard({ onPress, fileName }: { onPress(): void; fileName?: string }) { return <Pressable onPress={onPress}><Card><View style={{ alignItems: "center", paddingVertical: 22 }}><Text style={{ color: colors.accent, fontSize: 34 }}>♫</Text><Text style={[ui.body, { fontWeight: "800", marginTop: 8 }]}>{fileName || "Choose MP3 file"}</Text><Text style={[ui.muted, { marginTop: 5 }]}>Tap to browse</Text></View></Card></Pressable>; }
function Mode({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) { return <Pressable onPress={onPress} style={{ flex: 1, minHeight: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.text : "transparent" }}><Text style={{ color: selected ? colors.background : colors.muted, fontWeight: "800" }}>{label}</Text></Pressable>; }
