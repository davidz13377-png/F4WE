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
const USER_KEY = "music-box-session-user";

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  const saveSession = async (value: { token: string; user: User }) => {
    setApiToken(value.token); setToken(value.token); setUser(value.user);
    await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, value.token), SecureStore.setItemAsync(USER_KEY, JSON.stringify(value.user))]);
  };
  const refresh = async () => {
    const result = await api<{ user: User; refreshedToken: string }>("/api/profile/me");
    await saveSession({ token: result.refreshedToken, user: result.user });
  };
  useEffect(() => { void (async () => {
    const [saved, savedUser] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]);
    if (saved) {
      setApiToken(saved); setToken(saved);
      if (savedUser) { try { setUser(JSON.parse(savedUser) as User); } catch { /* Refresh replaces invalid cached data. */ } }
      try { await refresh(); } catch (error) {
        if ((error as { status?: number }).status === 401) { await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]); setApiToken(null); setToken(null); setUser(null); }
      }
    }
    setLoading(false);
  })(); }, []);
  useEffect(() => {
    if (!token) return;
    const nextSocket = io(API_URL, { transports: ["websocket"], auth: { token } });
    setSocket(nextSocket);
    nextSocket.on("rankChanged", () => void refresh());
    nextSocket.on("profileChanged", () => void refresh());
    nextSocket.on("coinsChanged", () => void refresh());
    nextSocket.on("accountDeleted", () => void logout());
    nextSocket.on("sessionInvalidated", () => void logout());
    return () => { nextSocket.off("coinsChanged"); nextSocket.off("sessionInvalidated"); setSocket(current => current === nextSocket ? null : current); nextSocket.disconnect(); };
  }, [token]);

  const login = async (username: string, password: string) => saveSession(await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }));
  const register = async (username: string, password: string, accessKey: string) => saveSession(await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, accessKey }) }));
  const logout = async () => { await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]); setApiToken(null); setToken(null); setUser(null); };

  return <AuthContext.Provider value={useMemo(() => ({ user, token, loading, socket, login, register, logout, refresh }), [user, token, loading, socket])}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value; }
