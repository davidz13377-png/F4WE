import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api, setApiToken } from "../lib/api";
import { API_URL } from "../lib/api";
import { io } from "socket.io-client";
import type { User } from "../types";

type AuthValue = {
  user: User | null; token: string | null; loading: boolean;
  login(username: string, password: string): Promise<void>;
  register(username: string, password: string, accessKey: string): Promise<void>;
  logout(): Promise<void>; refresh(): Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = "music-box-session";

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const saveSession = async (value: { token: string; user: User }) => {
    setApiToken(value.token); setToken(value.token); setUser(value.user);
    await SecureStore.setItemAsync(TOKEN_KEY, value.token);
  };
  const refresh = async () => {
    const result = await api<{ user: User; refreshedToken: string }>("/api/profile/me");
    await saveSession({ token: result.refreshedToken, user: result.user });
  };
  useEffect(() => { void (async () => {
    const saved = await SecureStore.getItemAsync(TOKEN_KEY);
    if (saved) { setApiToken(saved); setToken(saved); try { await refresh(); } catch { await SecureStore.deleteItemAsync(TOKEN_KEY); setApiToken(null); } }
    setLoading(false);
  })(); }, []);
  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { transports: ["websocket"], auth: { token } });
    socket.on("rankChanged", () => void refresh());
    socket.on("profileChanged", () => void refresh());
    socket.on("accountDeleted", () => void logout());
    return () => { socket.disconnect(); };
  }, [token]);

  const login = async (username: string, password: string) => saveSession(await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }));
  const register = async (username: string, password: string, accessKey: string) => saveSession(await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, accessKey }) }));
  const logout = async () => { await SecureStore.deleteItemAsync(TOKEN_KEY); setApiToken(null); setToken(null); setUser(null); };

  return <AuthContext.Provider value={useMemo(() => ({ user, token, loading, login, register, logout, refresh }), [user, token, loading])}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value; }
