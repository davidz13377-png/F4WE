import { createServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import type { Rank } from "@prisma/client";
import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { setSocketServer } from "./services/realtime.js";
import { notifyUser } from "./services/realtime.js";
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
io.on("connection", socket => socket.join(`user:${socket.data.userId}`));
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
