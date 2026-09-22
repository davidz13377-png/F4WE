import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Input, Screen, Title, ui } from "../src/components/UI";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";
import { F4WEAlert as Alert } from "../src/components/F4WEAlert";

export default function Login() {
  const { user, login } = useAuth(); const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Redirect href="/(tabs)" />;
  const submit = async () => { try { setBusy(true); await login(username, password); router.replace("/(tabs)"); } catch (e) { Alert.alert("Could not sign in", e instanceof Error ? e.message : "Try again"); } finally { setBusy(false); } };
  return <Screen><View style={{ flex: 1, justifyContent: "center" }}><Text style={{ color: colors.accent, fontSize: 18, fontWeight: "900", marginBottom: 8 }}>F4WE</Text><Title subtitle="Your music, your space.">Welcome back</Title><Input placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} /><Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} /><Button title="Sign in" loading={busy} onPress={() => void submit()} /><View style={[ui.row, { justifyContent: "center", marginTop: 22, gap: 5 }]}><Text style={ui.muted}>New to F4WE?</Text><Link href="/register" style={{ color: colors.accent, fontWeight: "800" }}>Create account</Link></View></View></Screen>;
}
