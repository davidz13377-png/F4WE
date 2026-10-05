import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { notifyUser } from "../services/realtime.js";
import { createUserNotification } from "../services/notifications.js";
import { beginDirectUpload, completeDirectUpload, deleteImage } from "../services/storage.js";

const router = Router();
router.use(authenticate);

function ownerOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.isOwner) return res.status(403).json({ error: "Owner access required" });
  next();
}

const profileSelect = {
  coins: true, animatedProfileUnlocked: true, animatedBannerUnlocked: true, activeProfileDesignId: true
} as const;

async function rewardSettings() {
  const values = await prisma.systemSetting.findMany({ where: { key: { in: ["reward.interval_seconds", "reward.coin_amount"] } } });
  const map = new Map(values.map(item => [item.key, Number(item.value)]));
  return {
    intervalSeconds: Math.max(60, Math.min(86_400, map.get("reward.interval_seconds") || 180)),
    coinAmount: Math.max(1, Math.min(10_000, map.get("reward.coin_amount") || 1))
  };
}

router.get("/", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const manage = req.auth!.isOwner && req.query.manage === "true";
  const [user, products, designs, owned, invites, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect }),
    prisma.shopProduct.findMany({ orderBy: { key: "asc" } }),
    prisma.profileDesign.findMany({
      // Retired designs disappear for new buyers, while everyone who bought one
      // keeps it in their collection and can equip it again later.
      where: manage ? undefined : { OR: [{ active: true }, { owners: { some: { userId } } }] },
      orderBy: [{ isLimited: "desc" }, { createdAt: "desc" }]
    }),
    prisma.ownedProfileDesign.findMany({ where: { userId }, select: { designId: true } }),
    prisma.rewardInvite.findMany({ where: { buyerId: userId, access: { used: false } }, select: { accessKey: true, createdAt: true, access: { select: { used: true, usedCount: true } } }, orderBy: { createdAt: "desc" } }),
    rewardSettings()
  ]);
  const ownedIds = new Set(owned.map(item => item.designId));
  res.json({ user, products, designs: designs.map(item => ({ ...item, owned: ownedIds.has(item.id), using: item.id === user.activeProfileDesignId })), invites, rewardSettings: settings });
}));

router.post("/purchase/:key", asyncRoute(async (req, res) => {
  const key = z.enum(["invite_code", "animated_profile", "animated_banner"]).parse(req.params.key);
  const userId = req.auth!.userId;
  const inviteCode = key === "invite_code" ? `rew${randomBytes(9).toString("base64url")}` : null;
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const [user, product] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect }),
      tx.shopProduct.findUnique({ where: { key } })
    ]);
    if (!product?.active) throw Object.assign(new Error("This shop item is not active right now"), { status: 409 });
    if (key === "animated_profile" && user.animatedProfileUnlocked) throw Object.assign(new Error("Animated profile pictures are already unlocked"), { status: 409 });
    if (key === "animated_banner" && user.animatedBannerUnlocked) throw Object.assign(new Error("Animated banners are already unlocked"), { status: 409 });
    if (user.coins < product.price) throw Object.assign(new Error("Not enough F4WE coins"), { status: 409 });
    const data = key === "animated_profile" ? { coins: { decrement: product.price }, animatedProfileUnlocked: true }
      : key === "animated_banner" ? { coins: { decrement: product.price }, animatedBannerUnlocked: true }
      : { coins: { decrement: product.price } };
    const updated = await tx.user.update({ where: { id: userId }, data, select: profileSelect });
    await tx.coinTransaction.create({ data: { userId, amount: -product.price, reason: `shop.${key}` } });
    if (inviteCode) {
      await tx.accessKey.create({ data: { key: inviteCode, usageLimit: 1, createdByDiscordId: `reward:${userId}` } });
      await tx.rewardInvite.create({ data: { buyerId: userId, accessKey: inviteCode } });
    }
    return { user: updated, inviteCode };
  });
  notifyUser(userId, "coinsChanged", { coins: result.user.coins });
  await audit("DEBUG", userId, "shop.product_purchased", { product: key, inviteCode: result.inviteCode });
  res.json(result);
}));

router.post("/designs/:id/purchase", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId, designId = req.params.id as string;
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const [user, design, owned] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      tx.profileDesign.findUnique({ where: { id: designId } }),
      tx.ownedProfileDesign.findUnique({ where: { userId_designId: { userId, designId } } })
    ]);
    if (!design?.active) throw Object.assign(new Error("This design is not available"), { status: 404 });
    if (owned) throw Object.assign(new Error("You already own this design"), { status: 409 });
    if (user.coins < design.price) throw Object.assign(new Error("Not enough F4WE coins"), { status: 409 });
    await tx.ownedProfileDesign.create({ data: { userId, designId, pricePaid: design.price } });
    const updated = await tx.user.update({ where: { id: userId }, data: { coins: { decrement: design.price } }, select: { coins: true } });
    await tx.coinTransaction.create({ data: { userId, amount: -design.price, reason: `design.${designId}` } });
    return { coins: updated.coins };
  });
  notifyUser(userId, "coinsChanged", result);
  res.json(result);
}));

router.post("/transfer", asyncRoute(async (req, res) => {
  const senderId = req.auth!.userId;
  const { friendId, amount } = z.object({ friendId: z.string().regex(/^\d{1,16}$/, "App ID must contain 1 to 16 digits"), amount: z.number().int().min(1).max(1_000_000) }).strict().parse(req.body);
  if (friendId === senderId) return res.status(400).json({ error: "You cannot transfer coins to yourself" });
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${senderId}, ${friendId}) ORDER BY id FOR UPDATE`;
    const [sender, receiver, friendship] = await Promise.all([
      tx.user.findUnique({ where: { id: senderId }, select: { coins: true, username: true } }),
      tx.user.findUnique({ where: { id: friendId }, select: { coins: true, username: true } }),
      tx.friendship.findUnique({ where: { userId_friendId: { userId: senderId, friendId } }, select: { userId: true } })
    ]);
    if (!sender || !receiver || !friendship) throw Object.assign(new Error("You can only transfer coins to an accepted friend"), { status: 403 });
    if (sender.coins < amount) throw Object.assign(new Error("Not enough F4WE COIN"), { status: 409 });
    const [updated] = await Promise.all([
      tx.user.update({ where: { id: senderId }, data: { coins: { decrement: amount } }, select: { coins: true } }),
      tx.user.update({ where: { id: friendId }, data: { coins: { increment: amount } } }),
      tx.coinTransaction.createMany({ data: [
        { userId: senderId, amount: -amount, reason: `friend.transfer.sent:${friendId}` },
        { userId: friendId, amount, reason: `friend.transfer.received:${senderId}`, actorId: senderId }
      ] })
    ]);
    return { coins: updated.coins, senderName: sender.username, receiverName: receiver.username };
  });
  notifyUser(senderId, "coinsChanged", { coins: result.coins });
  await createUserNotification(friendId, "F4WE COIN received", `${result.senderName} sent you ${amount} F4WE COIN.`, { type: "coin_transfer", senderId });
  res.json({ coins: result.coins, receiverName: result.receiverName });
}));

router.post("/designs/:id/use", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId, designId = req.params.id as string;
  const owned = await prisma.ownedProfileDesign.findUnique({ where: { userId_designId: { userId, designId } }, include: { design: true } });
  if (!owned) return res.status(403).json({ error: "Buy this design before using it" });
  await prisma.user.update({ where: { id: userId }, data: { activeProfileDesignId: designId } });
  res.json({ activeProfileDesignId: designId, profileDesignUrl: owned.design.assetUrl });
}));

router.delete("/designs/active", asyncRoute(async (req, res) => {
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { activeProfileDesignId: null } });
  res.status(204).end();
}));

router.post("/owner/coins", ownerOnly, asyncRoute(async (req, res) => {
  const { userId, amount } = z.object({ userId: z.string().regex(/^\d{1,16}$/, "App ID must contain 1 to 16 digits"), amount: z.number().int().min(-10_000_000).max(10_000_000).refine(value => value !== 0) }).strict().parse(req.body);
  const updated = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
    if (!current) throw Object.assign(new Error("User not found"), { status: 404 });
    const coins = current.coins + amount;
    if (coins < 0) throw Object.assign(new Error("Coin balance cannot be negative"), { status: 409 });
    await tx.coinTransaction.create({ data: { userId, amount, reason: "owner.adjustment", actorId: req.auth!.userId } });
    return tx.user.update({ where: { id: userId }, data: { coins }, select: { id: true, username: true, coins: true } });
  });
  notifyUser(userId, "coinsChanged", { coins: updated.coins });
  await createUserNotification(userId, amount > 0 ? "F4WE COIN added" : "F4WE COIN adjusted", `Owner changed your balance by ${amount > 0 ? "+" : ""}${amount}. New balance: ${updated.coins} F4WE COIN.`, { type: "coin_adjustment", amount });
  await audit("DEBUG", userId, "coins.owner_adjusted", { amount, coins: updated.coins, ownerId: req.auth!.userId });
  res.json(updated);
}));

router.patch("/owner/products/:key", ownerOnly, asyncRoute(async (req, res) => {
  const key = z.enum(["invite_code", "animated_profile", "animated_banner"]).parse(req.params.key);
  const data = z.object({ price: z.number().int().min(0).max(10_000_000).optional(), active: z.boolean().optional() }).strict().parse(req.body);
  res.json(await prisma.shopProduct.update({ where: { key }, data }));
}));

router.patch("/owner/reward-settings", ownerOnly, asyncRoute(async (req, res) => {
  const value = z.object({ intervalMinutes: z.number().int().min(1).max(1440), coinAmount: z.number().int().min(1).max(10_000) }).strict().parse(req.body);
  await prisma.$transaction([
    prisma.systemSetting.upsert({ where: { key: "reward.interval_seconds" }, create: { key: "reward.interval_seconds", value: String(value.intervalMinutes * 60) }, update: { value: String(value.intervalMinutes * 60) } }),
    prisma.systemSetting.upsert({ where: { key: "reward.coin_amount" }, create: { key: "reward.coin_amount", value: String(value.coinAmount) }, update: { value: String(value.coinAmount) } })
  ]);
  res.json({ intervalSeconds: value.intervalMinutes * 60, coinAmount: value.coinAmount });
}));

router.post("/owner/designs/upload-url", ownerOnly, asyncRoute(async (req, res) => {
  const { mimeType, size } = z.object({ mimeType: z.string().min(1).max(100), size: z.number().int().positive().optional() }).strict().parse(req.body);
  res.json(await beginDirectUpload("profile-design", req.auth!.userId, mimeType, size));
}));

router.post("/owner/designs/complete", ownerOnly, asyncRoute(async (req, res) => {
  const input = z.object({ uploadToken: z.string().min(1).max(5000), name: z.string().trim().min(1).max(80), price: z.number().int().min(0).max(10_000_000), isLimited: z.boolean().default(false) }).strict().parse(req.body);
  const uploaded = await completeDirectUpload("profile-design", req.auth!.userId, input.uploadToken);
  try {
    const design = await prisma.profileDesign.create({ data: { name: input.name, price: input.price, isLimited: input.isLimited, assetUrl: uploaded.url, createdById: req.auth!.userId } });
    res.status(201).json(design);
  } catch (error) { await deleteImage(uploaded.url, "profile-design"); throw error; }
}));

router.patch("/owner/designs/:id", ownerOnly, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(1).max(80).optional(), price: z.number().int().min(0).max(10_000_000).optional(), isLimited: z.boolean().optional(), active: z.boolean().optional() }).strict().parse(req.body);
  res.json(await prisma.profileDesign.update({ where: { id: req.params.id as string }, data }));
}));

router.delete("/owner/designs/:id", ownerOnly, asyncRoute(async (req, res) => {
  const design = await prisma.profileDesign.findUnique({ where: { id: req.params.id as string } });
  if (!design) return res.status(404).json({ error: "Design not found" });
  // Never delete purchased designs or their files. Removing a design only
  // retires it from sale; existing owners retain permanent access.
  await prisma.profileDesign.update({ where: { id: design.id }, data: { active: false } });
  await audit("DEBUG", req.auth!.userId, "shop.design_retired", { designId: design.id, name: design.name });
  res.status(204).end();
}));

export default router;
