import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../lib/theme";

type Announcement = { id: string; title: string; body: string; createdAt: string; by: string };
type SystemStatus = { maintenanceApplies: boolean };

export function OwnerAnnouncementGate() {
  const { user, token } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!user || !token) { setAnnouncements([]); return; }
    try {
      const status = await api<SystemStatus>("/api/system/status");
      if (status.maintenanceApplies && !user.isOwner) { setAnnouncements([]); return; }
      setAnnouncements(await api<Announcement[]>("/api/system/announcements/pending"));
    } catch { /* The next refresh retries without interrupting app startup. */ }
  }, [token, user?.id, user?.isOwner]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);
  const current = announcements[0];
  const dismiss = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api(`/api/system/announcements/${encodeURIComponent(current.id)}/dismiss`, { method: "POST" });
      setAnnouncements(items => items.filter(item => item.id !== current.id));
    } finally { setBusy(false); }
  };
  if (!current) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
    <View style={styles.backdrop}><View style={styles.card}>
      <View style={styles.icon}><Ionicons name="megaphone-outline" size={30} color={colors.softRed} /></View>
      <Text style={styles.eyebrow}>F4WE MESSAGE</Text>
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.body}>{current.body}</Text>
      <Text style={styles.sender}>by {current.by}</Text>
      <Pressable disabled={busy} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.72 }]} onPress={() => void dismiss()}>
        <Text style={styles.buttonText}>{busy ? "PLEASE WAIT" : "OK"}</Text>
      </Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000E8", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 430, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 26 },
  icon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#2B1D20", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  eyebrow: { color: colors.softRed, fontSize: 10, letterSpacing: 2.3, fontWeight: "900" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900", marginTop: 7 },
  body: { color: colors.text, fontSize: 16, lineHeight: 24, marginTop: 14 },
  sender: { color: colors.muted, fontSize: 12, fontWeight: "800", marginTop: 18 },
  button: { height: 54, borderRadius: 27, backgroundColor: colors.text, alignItems: "center", justifyContent: "center", marginTop: 22 },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: "900", letterSpacing: 1.1 }
});
