import type { Server } from "socket.io";

let socketServer: Server | undefined;
const onlineConnections = new Map<string, number>();

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
    socketServer?.to(`listen:${userId}`).emit("listening:unavailable", { userId });
  }
}

export function publishListening(userId: string, state: Omit<ListeningState, "updatedAt"> | null) {
  if (!state) {
    listening.delete(userId);
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
  notifyUser(listenerId, "listening:unavailable", { userId: targetId });
}
