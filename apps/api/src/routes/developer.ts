import { Router } from "express";
import { Rank } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate, requireRank } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { notifyUser } from "../services/realtime.js";
import { deleteImage } from "../services/storage.js";

const router = Router();
router.use(authenticate, requireRank(Rank.Developer));

router.get("/users", asyncRoute(async (req, res) => {
  const q = z.string().max(100).catch("").parse(req.query.q ?? "");
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { id: { contains: q } }] } : undefined,
    select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true, registrationDate: true },
    orderBy: { registrationDate: "desc" }, take: 200
  });
  res.json(users);
}));

router.patch("/users/:id/rank", asyncRoute(async (req, res) => {
  const { rank } = z.object({ rank: z.nativeEnum(Rank) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.isOwner) return res.status(403).json({ error: "Owner accounts cannot be modified" });
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, isOwner: false }, data: { rank } });
    if (!changed.count) throw Object.assign(new Error("Owner accounts cannot be modified"), { status: 403 });
    await tx.userRanksHistory.create({ data: { userId: user.id, oldRank: user.rank, newRank: rank, changedBy: req.auth!.userId } });
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, username: true, rank: true } });
  });
  const notification = await prisma.notification.create({ data: { userId: user.id, title: "Rank updated", body: `Your rank is now ${rank}. Sign in again if the menu does not update.` } });
  notifyUser(user.id, "rankChanged", { rank, notification });
  await audit("RANK_CHANGE", user.id, "user.rank_changed", { oldRank: user.rank, newRank: rank, changedBy: req.auth!.userId });
  res.json(updated);
}));

router.patch("/users/:id", asyncRoute(async (req, res) => {
  const { username } = z.object({ username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/, "Use letters, numbers, _, . or -") }).strict().parse(req.body);
  const current = await prisma.user.findUnique({ where: { id: req.params.id as string }, select: { id: true, username: true, rank: true, isOwner: true } });
  if (!current) return res.status(404).json({ error: "User not found" });
  if (current.isOwner) return res.status(403).json({ error: "Owner accounts cannot be modified" });
  const duplicate = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" }, NOT: { id: current.id } }, select: { id: true } });
  if (duplicate) return res.status(409).json({ error: "That username is already taken" });
  const changed = await prisma.user.updateMany({ where: { id: current.id, isOwner: false }, data: { username } });
  if (!changed.count) return res.status(403).json({ error: "Owner accounts cannot be modified" });
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: current.id }, select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true, registrationDate: true } });
  await audit("DEBUG", current.id, "user.renamed", { oldUsername: current.username, username, changedBy: req.auth!.userId });
  notifyUser(current.id, "profileChanged", { username });
  res.json(updated);
}));

router.delete("/users/:id/profile-picture", asyncRoute(async (req, res) => {
  const current = await prisma.user.findUnique({ where: { id: req.params.id as string }, select: { id: true, isOwner: true, profilePicture: true } });
  if (!current) return res.status(404).json({ error: "User not found" });
  if (current.isOwner) return res.status(403).json({ error: "Owner accounts cannot be modified" });
  const changed = await prisma.user.updateMany({ where: { id: current.id, isOwner: false }, data: { profilePicture: null } });
  if (!changed.count) return res.status(403).json({ error: "Owner accounts cannot be modified" });
  await deleteImage(current.profilePicture, "profile");
  await audit("DEBUG", current.id, "user.profile_picture_removed", { changedBy: req.auth!.userId });
  notifyUser(current.id, "profileChanged", { profilePicture: null });
  res.status(204).end();
}));

router.delete("/users/:id", asyncRoute(async (req, res) => {
  const userId = req.params.id as string;
  if (userId === req.auth!.userId) return res.status(400).json({ error: "You cannot delete your own active developer account" });
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true } });
  if (!current) return res.status(404).json({ error: "User not found" });
  if (current.isOwner) return res.status(403).json({ error: "Owner accounts cannot be deleted" });
  const changed = await prisma.user.deleteMany({ where: { id: current.id, isOwner: false } });
  if (!changed.count) return res.status(403).json({ error: "Owner accounts cannot be deleted" });
  await audit("DEBUG", current.id, "user.deleted", { username: current.username, rank: current.rank, deletedBy: req.auth!.userId });
  await deleteImage(current.profilePicture, "profile");
  notifyUser(current.id, "accountDeleted", {});
  res.status(204).end();
}));

export default router;
