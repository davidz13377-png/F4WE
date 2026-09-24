import { createServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import type { Rank } from "@prisma/client";
import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { notifyUser, presenceFor, publishListening, setSocketServer, userConnected, userDisconnected } from "./services/realtime.js";
import { audit } from "./services/logging.js";

const server = createServer(app);
const io = new Server(server, { cors: { origin: env.CORS_ORIGINS.split(",").map(v => v.trim()) } });

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token as string;
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: "music-box-api" }) as { sub: string; rank: Rank };
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});
io.on("connection", socket => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);
  userConnected(userId);
  socket.data.shareListening = false;
  void prisma.user.findUnique({ where: { id: userId }, select: { shareListening: true } }).then(user => { socket.data.shareListening = user?.shareListening === true; }).catch(() => undefined);

  socket.on("listening:update", raw => {
    try {
      if (socket.data.shareListening !== true) return publishListening(userId, null);
      const value = raw as Record<string, unknown>;
      const musicId = typeof value.musicId === "string" ? value.musicId.slice(0, 100) : "";
      const title = typeof value.title === "string" ? value.title.slice(0, 150) : "";
      const position = typeof value.position === "number" && Number.isFinite(value.position) ? Math.max(0, value.position) : 0;
      if (!musicId || !title) return;
      publishListening(userId, {
        musicId, title,
        artist: typeof value.artist === "string" ? value.artist.slice(0, 150) : null,
        artworkUrl: typeof value.artworkUrl === "string" ? value.artworkUrl.slice(0, 2000) : null,
        position,
        playing: value.playing === true
      });
    } catch (error) { console.error("Listening presence update failed", error); }
  });

  socket.on("listening:privacy", value => {
    if (value !== true) { socket.data.shareListening = false; publishListening(userId, null); return; }
    void prisma.user.findUnique({ where: { id: userId }, select: { shareListening: true } }).then(user => { socket.data.shareListening = user?.shareListening === true; }).catch(() => undefined);
  });

  socket.on("listening:join", async (targetId: unknown, reply?: (value: unknown) => void) => {
    try {
      if (typeof targetId !== "string" || targetId === userId) throw new Error("Invalid friend");
      const [friendship, target] = await Promise.all([
        prisma.friendship.findUnique({ where: { userId_friendId: { userId, friendId: targetId } }, select: { userId: true } }),
        prisma.user.findUnique({ where: { id: targetId }, select: { shareListening: true } })
      ]);
      if (!friendship || !target?.shareListening) throw new Error("This friend is not sharing listening activity");
      const current = presenceFor(targetId).listening;
      if (!current) throw new Error("This friend is not currently listening");
      for (const room of socket.rooms) if (room.startsWith("listen:")) socket.leave(room);
      socket.join(`listen:${targetId}`);
      socket.emit("listening:state", { userId: targetId, ...current });
      reply?.({ ok: true });
    } catch (error) { reply?.({ ok: false, error: error instanceof Error ? error.message : "Could not join" }); }
  });

  socket.on("listening:leave", () => {
    for (const room of socket.rooms) if (room.startsWith("listen:")) socket.leave(room);
  });
  socket.on("disconnect", () => userDisconnected(userId));
});
setSocketServer(io);

let lastRankCheck = new Date();
setInterval(async () => {
  try {
    const checkedAt = new Date();
    const changes = await prisma.userRanksHistory.findMany({ where: { changeDate: { gt: lastRankCheck } }, orderBy: { changeDate: "asc" } });
    lastRankCheck = checkedAt;
    for (const change of changes) notifyUser(change.userId, "rankChanged", { rank: change.newRank });
  } catch (error) {
    console.error("Rank sync failed", error);
    await audit("DEBUG", null, "api.rank_sync_failed", { error: error instanceof Error ? error.message : String(error) }).catch(console.error);
  }
}, 2_000).unref();

const port = env.PORT ?? env.API_PORT;
server.listen(port, "0.0.0.0", () => console.log(`F4WE API listening on :${port}`));

async function shutdown(signal: string) {
  console.log(`${signal}: shutting down`);
  io.close();
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
