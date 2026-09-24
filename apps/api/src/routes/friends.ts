import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { presenceFor, revokeListeningJoin } from "../services/realtime.js";

const router = Router();
router.use(authenticate);
const publicUser = { id: true, username: true, rank: true, isOwner: true, profilePicture: true } as const;

router.get("/", asyncRoute(async (req, res) => {
  const rows = await prisma.friendship.findMany({
    where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" }, include: { friend: { select: publicUser } }
  });
  res.json(rows.map(row => ({ ...row.friend, friendsSince: row.createdAt, ...presenceFor(row.friendId) })));
}));

router.get("/search", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const q = z.string().trim().min(2).max(32).parse(req.query.q ?? "");
  const users = await prisma.user.findMany({
    where: { id: { not: userId }, username: { contains: q, mode: "insensitive" } }, select: publicUser, orderBy: { username: "asc" }, take: 30
  });
  const ids = users.map(user => user.id);
  const [friends, sent, received] = await Promise.all([
    prisma.friendship.findMany({ where: { userId, friendId: { in: ids } }, select: { friendId: true } }),
    prisma.friendRequest.findMany({ where: { senderId: userId, receiverId: { in: ids } }, select: { receiverId: true } }),
    prisma.friendRequest.findMany({ where: { receiverId: userId, senderId: { in: ids } }, select: { senderId: true } })
  ]);
  const friendIds = new Set(friends.map(row => row.friendId)), sentIds = new Set(sent.map(row => row.receiverId)), receivedIds = new Set(received.map(row => row.senderId));
  res.json(users.map(user => ({ ...user, relationship: friendIds.has(user.id) ? "friend" : sentIds.has(user.id) ? "sent" : receivedIds.has(user.id) ? "received" : "none" })));
}));

router.get("/requests", asyncRoute(async (req, res) => {
  res.json(await prisma.friendRequest.findMany({ where: { receiverId: req.auth!.userId }, orderBy: { createdAt: "desc" }, include: { sender: { select: publicUser } } }));
}));

router.post("/requests", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const { username } = z.object({ username: z.string().trim().min(1).max(32) }).strict().parse(req.body);
  const target = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: publicUser });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === userId) return res.status(400).json({ error: "You cannot add yourself" });
  if (await prisma.friendship.findUnique({ where: { userId_friendId: { userId, friendId: target.id } } })) return res.status(409).json({ error: "You are already friends" });
  if (await prisma.friendRequest.findUnique({ where: { senderId_receiverId: { senderId: target.id, receiverId: userId } } })) return res.status(409).json({ error: "This user already sent you a request. Open the Requests tab." });
  const request = await prisma.friendRequest.upsert({
    where: { senderId_receiverId: { senderId: userId, receiverId: target.id } }, update: {}, create: { senderId: userId, receiverId: target.id }
  });
  res.status(201).json(request);
}));

router.post("/requests/:id/accept", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const request = await prisma.friendRequest.findFirst({ where: { id: req.params.id as string, receiverId: userId } });
  if (!request) return res.status(404).json({ error: "Friend request not found" });
  await prisma.$transaction([
    prisma.friendship.upsert({ where: { userId_friendId: { userId, friendId: request.senderId } }, update: {}, create: { userId, friendId: request.senderId } }),
    prisma.friendship.upsert({ where: { userId_friendId: { userId: request.senderId, friendId: userId } }, update: {}, create: { userId: request.senderId, friendId: userId } }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: request.senderId, receiverId: userId }, { senderId: userId, receiverId: request.senderId }] } })
  ]);
  res.status(204).end();
}));

router.delete("/requests/:id", asyncRoute(async (req, res) => {
  const result = await prisma.friendRequest.deleteMany({ where: { id: req.params.id as string, receiverId: req.auth!.userId } });
  if (!result.count) return res.status(404).json({ error: "Friend request not found" });
  res.status(204).end();
}));

router.delete("/:friendId", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId, friendId = req.params.friendId as string;
  await prisma.$transaction([
    prisma.friendship.deleteMany({ where: { OR: [{ userId, friendId }, { userId: friendId, friendId: userId }] } }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ senderId: userId, receiverId: friendId }, { senderId: friendId, receiverId: userId }] } })
  ]);
  revokeListeningJoin(userId, friendId); revokeListeningJoin(friendId, userId);
  res.status(204).end();
}));

export default router;
