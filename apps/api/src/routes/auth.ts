import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errors.js";
import { signToken } from "../middleware/auth.js";
import { audit } from "../services/logging.js";

const router = Router();
const credentials = z.object({ username: z.string().trim().min(3).max(32), password: z.string().min(8).max(128) });
const registration = credentials.extend({ accessKey: z.string().trim().regex(/^[A-Za-z0-9_-]{3,64}$/, "Access key must be 3-64 letters, numbers, _ or -") });

async function newUserId() {
  for (let i = 0; i < 10; i++) {
    let id = "";
    for (let n = 0; n < 16; n++) id += randomInt(n === 0 ? 1 : 0, 10).toString();
    if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) return id;
  }
  throw new Error("Could not allocate a user ID");
}

router.post("/register", asyncRoute(async (req, res) => {
  const input = registration.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const id = await newUserId();
  const user = await prisma.$transaction(async tx => {
    // Serialize use of the same key so concurrent registrations cannot exceed its limit.
    await tx.$queryRaw`SELECT "key" FROM "AccessKey" WHERE "key" = ${input.accessKey} FOR UPDATE`;
    const key = await tx.accessKey.findUnique({ where: { key: input.accessKey } });
    if (!key || key.used || key.usedCount >= key.usageLimit) throw Object.assign(new Error("Invalid or fully used access key"), { status: 400 });
    const created = await tx.user.create({
      data: { id, username: input.username, passwordHash, accessKeyUsed: input.accessKey },
      select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true, registrationDate: true, shareListening: true }
    });
    const nextCount = key.usedCount + 1;
    await tx.accessKey.update({ where: { key: input.accessKey }, data: {
      usedCount: nextCount, used: nextCount >= key.usageLimit,
      usedDate: nextCount >= key.usageLimit ? new Date() : null
    } });
    return created;
  });
  await audit("USER_REGISTRATION", user.id, "user.registered", { username: user.username, accessKey: input.accessKey });
  res.status(201).json({ token: signToken(user.id, user.rank), user });
}));

router.post("/login", asyncRoute(async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { username: input.username } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: "Invalid username or password" });
  res.json({
    token: signToken(user.id, user.rank),
    user: { id: user.id, username: user.username, rank: user.rank, isOwner: user.isOwner, profilePicture: user.profilePicture, registrationDate: user.registrationDate, shareListening: user.shareListening }
  });
}));

export default router;
