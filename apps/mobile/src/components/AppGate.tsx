import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../lib/api";
import { colors } from "../lib/theme";
import { useAuth } from "../context/AuthContext";

export type AppStatus = { minimumVersion: string; updateMessage: string; maintenanceEnabled: boolean; maintenanceMessage: string; downloadUrl: string };

function olderThan(current: string, minimum: string) {
  const parse = (value: string) => value.split(/[.+-]/).slice(0, 3).map(part => Number(part) || 0);
  const a = parse(current), b = parse(minimum);
  for (let index = 0; index < 3; index++) { if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0); }
  return false;
}

export function AppGate() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const load = useCallback(() => {
    void fetch(`${API_URL}/api/system/status`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(setStatus).catch(() => undefined);
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 15_000); return () => clearInterval(timer); }, [load]);
  const currentVersion = Constants.expoConfig?.version || "0.0.0";
  const updateRequired = !!status && olderThan(currentVersion, status.minimumVersion);
  // Logged-out users may reach Login so an Owner cannot lock themselves out.
  // After authentication every non-Owner is blocked by this gate and the API.
  const maintenance = !!status?.maintenanceEnabled && !!user && !user.isOwner;
  if (!status || (!updateRequired && !maintenance)) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
    <View style={styles.backdrop}><View style={styles.card}><View style={styles.icon}><Ionicons name={updateRequired ? "cloud-download-outline" : "construct-outline"} size={34} color={colors.softRed} /></View>
      <Text style={styles.eyebrow}>F4WE SYSTEM</Text><Text style={styles.title}>{updateRequired ? "Update required" : "Maintenance break"}</Text>
      <Text style={styles.body}>{updateRequired ? status.updateMessage : status.maintenanceMessage}</Text>
      {updateRequired ? <><Text style={styles.version}>Installed {currentVersion} • Required {status.minimumVersion}</Text><Pressable style={styles.button} onPress={() => void Linking.openURL(status.downloadUrl)}><Text style={styles.buttonText}>UPDATE</Text><Ionicons name="open-outline" size={19} color={colors.background} /></Pressable></> : <View style={styles.wait}><View style={styles.dot} /><Text style={styles.waitText}>Please keep F4WE open. It will unlock automatically.</Text></View>}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000F2", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 430, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 26 },
  icon: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#2B1D20", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  eyebrow: { color: colors.softRed, fontSize: 10, letterSpacing: 2.3, fontWeight: "900" },
  title: { color: colors.text, fontSize: 29, lineHeight: 34, fontWeight: "900", marginTop: 7 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 13 },
  version: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 18 },
  button: { height: 56, borderRadius: 28, backgroundColor: colors.text, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginTop: 22 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: "900", letterSpacing: 1.2 },
  wait: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.softRed }, waitText: { flex: 1, color: colors.text, fontSize: 12 }
});
