import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api, setApiToken } from "../lib/api";
import { API_URL } from "../lib/api";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { User } from "../types";

type AuthValue = {
  user: User | null; token: string | null; loading: boolean;
  socket: Socket | null;
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
  const [socket, setSocket] = useState<Socket | null>(null);

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
    const nextSocket = io(API_URL, { transports: ["websocket"], auth: { token } });
    setSocket(nextSocket);
    nextSocket.on("rankChanged", () => void refresh());
    nextSocket.on("profileChanged", () => void refresh());
    nextSocket.on("accountDeleted", () => void logout());
    return () => { setSocket(current => current === nextSocket ? null : current); nextSocket.disconnect(); };
  }, [token]);

  const login = async (username: string, password: string) => saveSession(await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }));
  const register = async (username: string, password: string, accessKey: string) => saveSession(await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, accessKey }) }));
  const logout = async () => { await SecureStore.deleteItemAsync(TOKEN_KEY); setApiToken(null); setToken(null); setUser(null); };

  return <AuthContext.Provider value={useMemo(() => ({ user, token, loading, socket, login, register, logout, refresh }), [user, token, loading, socket])}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value; }
