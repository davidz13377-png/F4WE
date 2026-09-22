import type { Server } from "socket.io";

let socketServer: Server | undefined;

export function setSocketServer(server: Server) {
  socketServer = server;
}

export function notifyUser(userId: string, event: string, payload: unknown) {
  socketServer?.to(`user:${userId}`).emit(event, payload);
}
