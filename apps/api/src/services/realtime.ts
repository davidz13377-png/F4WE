import type { Server } from "socket.io";

let socketServer: Server | undefined;
const onlineConnections = new Map<string, number>();
const listeningFollowers = new Map<string, Map<string, { username: string; connections: number }>>();

export type ListeningState = {
  musicId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  position: number;
  playing: boolean;
  updatedAt: number;
};

const listening = new Map<string, ListeningState>();

export function setSocketServer(server: Server) {
  socketServer = server;
}

export function notifyUser(userId: string, event: string, payload: unknown) {
  socketServer?.to(`user:${userId}`).emit(event, payload);
}

export function userConnected(userId: string) {
  onlineConnections.set(userId, (onlineConnections.get(userId) ?? 0) + 1);
}

export function userDisconnected(userId: string) {
  const remaining = Math.max(0, (onlineConnections.get(userId) ?? 1) - 1);
  if (remaining) onlineConnections.set(userId, remaining);
  else {
    onlineConnections.delete(userId);
    listening.delete(userId);
    listeningFollowers.delete(userId);
    notifyUser(userId, "listening:followers", []);
    socketServer?.to(`listen:${userId}`).emit("listening:unavailable", { userId });
  }
}

export function publishListening(userId: string, state: Omit<ListeningState, "updatedAt"> | null) {
  if (!state) {
    listening.delete(userId);
    listeningFollowers.delete(userId);
    notifyUser(userId, "listening:followers", []);
    socketServer?.to(`listen:${userId}`).emit("listening:unavailable", { userId });
    return;
  }
  const next = { ...state, updatedAt: Date.now() };
  listening.set(userId, next);
  socketServer?.to(`listen:${userId}`).emit("listening:state", { userId, ...next });
}

export function presenceFor(userId: string) {
  return { online: onlineConnections.has(userId), listening: listening.get(userId) ?? null };
}

export function revokeListeningJoin(listenerId: string, targetId: string) {
  socketServer?.in(`user:${listenerId}`).socketsLeave(`listen:${targetId}`);
  removeListeningFollower(listenerId, targetId, true);
  notifyUser(listenerId, "listening:unavailable", { userId: targetId });
}

function emitFollowers(targetId: string) {
  const followers = [...(listeningFollowers.get(targetId)?.entries() ?? [])].map(([id, value]) => ({ id, username: value.username }));
  notifyUser(targetId, "listening:followers", followers);
}

export function addListeningFollower(listenerId: string, username: string, targetId: string) {
  const target = listeningFollowers.get(targetId) ?? new Map<string, { username: string; connections: number }>();
  const existing = target.get(listenerId);
  target.set(listenerId, { username, connections: (existing?.connections ?? 0) + 1 });
  listeningFollowers.set(targetId, target);
  emitFollowers(targetId);
}

export function removeListeningFollower(listenerId: string, targetId: string, removeAll = false) {
  const target = listeningFollowers.get(targetId);
  if (!target) return;
  const existing = target.get(listenerId);
  if (!existing) return;
  if (removeAll || existing.connections <= 1) target.delete(listenerId);
  else target.set(listenerId, { ...existing, connections: existing.connections - 1 });
  if (!target.size) listeningFollowers.delete(targetId);
  emitFollowers(targetId);
}
