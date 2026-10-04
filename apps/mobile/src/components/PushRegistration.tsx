import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

export function PushRegistration() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || (Platform.OS !== "android" && Platform.OS !== "ios")) return;
    let live = true;
    void (async () => {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("f4we", { name: "F4WE", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], lightColor: "#E86B72" });
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
      if (!live || permission.status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (live) await api("/api/system/push-token", { method: "POST", body: JSON.stringify({ token, platform: Platform.OS }) });
    })().catch(error => console.warn("Push registration failed", error));
    return () => { live = false; };
  }, [user?.id]);
  return null;
}
