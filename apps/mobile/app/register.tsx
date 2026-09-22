import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Input, Screen, Title, ui } from "../src/components/UI";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";
import { F4WEAlert as Alert } from "../src/components/F4WEAlert";

export default function Register() {
  const { user, register } = useAuth(); const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [accessKey, setAccessKey] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Redirect href="/(tabs)" />;
  const submit = async () => { try { setBusy(true); await register(username, password, accessKey); router.replace("/(tabs)"); } catch (e) { Alert.alert("Could not register", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); } };
  return <Screen><View style={{ flex: 1, justifyContent: "center" }}><Text style={{ color: colors.accent, fontSize: 18, fontWeight: "900", marginBottom: 8 }}>F4WE</Text><Title subtitle="A Discord access key is required.">Create account</Title><Input placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} /><Input placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} /><Input placeholder="Access key" autoCapitalize="none" maxLength={64} value={accessKey} onChangeText={setAccessKey} /><Button title="Create account" loading={busy} onPress={() => void submit()} /><View style={[ui.row, { justifyContent: "center", marginTop: 22, gap: 5 }]}><Text style={ui.muted}>Already registered?</Text><Link href="/login" style={{ color: colors.accent, fontWeight: "800" }}>Sign in</Link></View></View></Screen>;
}
