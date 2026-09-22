import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};
type AlertOptions = { cancelable?: boolean; onDismiss?: () => void };
type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let nextId = 1;
let pending: AlertRequest | null = null;
let listener: ((request: AlertRequest) => void) | null = null;

export const F4WEAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const request: AlertRequest = {
      id: nextId++, title, message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }], options
    };
    if (listener) listener(request); else pending = request;
  }
};

export function F4WEAlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  useEffect(() => {
    listener = setRequest;
    if (pending) { setRequest(pending); pending = null; }
    return () => { listener = null; };
  }, []);

  const dismiss = (button?: AlertButton) => {
    const onPress = button?.onPress;
    const onDismiss = request?.options?.onDismiss;
    setRequest(null);
    requestAnimationFrame(() => { onPress?.(); onDismiss?.(); });
  };
  const cancel = () => {
    if (!request) return;
    const cancelButton = request.buttons.find(button => button.style === "cancel");
    if (request.options?.cancelable || cancelButton) dismiss(cancelButton);
  };

  return <Modal visible={!!request} transparent statusBarTranslucent animationType="fade" onRequestClose={cancel}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={request?.options?.cancelable ? cancel : undefined} />
      <View accessibilityRole="alert" style={styles.card}>
        <Text style={styles.brand}>F4WE</Text>
        <Text style={styles.title}>{request?.title}</Text>
        {request?.message ? <Text style={styles.message}>{request.message}</Text> : null}
        <View style={[styles.actions, (request?.buttons.length ?? 0) > 2 && styles.actionsStacked]}>
          {request?.buttons.map((button, index) => {
            const destructive = button.style === "destructive";
            const primary = !destructive && button.style !== "cancel" && index === request.buttons.length - 1;
            return <Pressable key={`${request.id}-${index}`} accessibilityRole="button" onPress={() => dismiss(button)} style={({ pressed }) => [styles.button, primary && styles.primaryButton, destructive && styles.destructiveButton, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, primary && styles.primaryButtonText, destructive && styles.destructiveText]}>{button.text ?? "OK"}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#000000CC" },
  card: { width: "100%", maxWidth: 420, padding: 22, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: .7, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 24 },
  brand: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 2.4, marginBottom: 12 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "900", letterSpacing: -.3 },
  message: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 22 },
  actionsStacked: { flexDirection: "column" },
  button: { minHeight: 44, minWidth: 92, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised },
  primaryButton: { backgroundColor: colors.white, borderColor: colors.white },
  destructiveButton: { backgroundColor: "#2A1113", borderColor: colors.red },
  pressed: { opacity: .68, transform: [{ scale: .98 }] },
  buttonText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  primaryButtonText: { color: colors.accentText },
  destructiveText: { color: colors.red }
});
