import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { createBroadcastNotification } from "../services/notifications.js";

const router = Router();
const platformSchema = z.enum(["android", "windows"]);
type ClientPlatform = z.infer<typeof platformSchema>;
const keys = [
  "app.minimum_version", "app.update_message", "app.maintenance_enabled", "app.maintenance_message",
  "app.maintenance_android", "app.maintenance_windows"
];

function clientPlatform(req: Request): ClientPlatform | null {
  const value = String(req.headers["x-f4we-platform"] || "").toLowerCase();
  return platformSchema.safeParse(value).success ? value as ClientPlatform : null;
}

async function status(platform: ClientPlatform | null = null) {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const values = new Map(rows.map(row => [row.key, row.value]));
  const maintenancePlatforms = {
    // Missing keys preserve the behavior of releases that only had one global switch.
    android: values.get("app.maintenance_android") !== "false",
    windows: values.get("app.maintenance_windows") !== "false"
  };
  const maintenanceEnabled = values.get("app.maintenance_enabled") === "true";
  return {
    minimumVersion: values.get("app.minimum_version") || "1.0.0",
    updateMessage: values.get("app.update_message") || "A new F4WE update is available. Please update the application to continue.",
    maintenanceEnabled,
    maintenancePlatforms,
    maintenanceApplies: maintenanceEnabled && (platform ? maintenancePlatforms[platform] : true),
    maintenanceMessage: values.get("app.maintenance_message") || "F4WE is currently under maintenance. This should not take long. Please try again soon.",
    downloadUrl: "https://f4we.xyz/"
  };
}

router.get("/status", asyncRoute(async (req, res) => res.json(await status(clientPlatform(req)))));

router.patch("/status", authenticate, asyncRoute(async (req, res) => {
  if (!req.auth!.isOwner) return res.status(403).json({ error: "Owner access required" });
  const input = z.object({
    minimumVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).optional(),
    updateMessage: z.string().trim().min(1).max(500).optional(),
    maintenanceEnabled: z.boolean().optional(),
    maintenancePlatforms: z.object({ android: z.boolean(), windows: z.boolean() }).strict().optional(),
    maintenanceMessage: z.string().trim().min(1).max(500).optional(),
    announceUpdate: z.boolean().optional()
  }).strict().parse(req.body);
  if (input.maintenanceEnabled && input.maintenancePlatforms && !input.maintenancePlatforms.android && !input.maintenancePlatforms.windows) {
    return res.status(400).json({ error: "Select Android, Windows 10/11, or both before enabling maintenance" });
  }
  const updates: [string, string][] = [];
  if (input.minimumVersion !== undefined) updates.push(["app.minimum_version", input.minimumVersion]);
  if (input.updateMessage !== undefined) updates.push(["app.update_message", input.updateMessage]);
  if (input.maintenanceEnabled !== undefined) updates.push(["app.maintenance_enabled", String(input.maintenanceEnabled)]);
  if (input.maintenancePlatforms !== undefined) {
    updates.push(["app.maintenance_android", String(input.maintenancePlatforms.android)]);
    updates.push(["app.maintenance_windows", String(input.maintenancePlatforms.windows)]);
  }
  if (input.maintenanceMessage !== undefined) updates.push(["app.maintenance_message", input.maintenanceMessage]);
  if (updates.length) await prisma.$transaction(updates.map(([key, value]) => prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } })));
  if (input.announceUpdate && input.minimumVersion) {
    await createBroadcastNotification("F4WE update available", input.updateMessage || "A new version of F4WE is available. Update now to continue.", { type: "app_update", url: "https://f4we.xyz/" });
  }
  await audit("DEBUG", req.auth!.userId, "system.settings_updated", { fields: Object.keys(input) });
  res.json(await status(clientPlatform(req)));
}));

router.post("/announcements", authenticate, asyncRoute(async (req, res) => {
  if (!req.auth!.isOwner) return res.status(403).json({ error: "Owner access required" });
  const input = z.object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(2000),
    platforms: z.array(platformSchema).min(1).max(2).transform(items => [...new Set(items)])
  }).strict().parse(req.body);
  const announcement = await prisma.ownerAnnouncement.create({
    data: { title: input.title, body: input.body, platforms: input.platforms, createdById: req.auth!.userId },
    include: { createdBy: { select: { username: true } } }
  });
  await audit("DEBUG", req.auth!.userId, "system.announcement_sent", { announcementId: announcement.id, platforms: input.platforms });
  res.status(201).json({ id: announcement.id, title: announcement.title, body: announcement.body, platforms: announcement.platforms, createdAt: announcement.createdAt, by: announcement.createdBy.username });
}));

router.get("/announcements/pending", authenticate, asyncRoute(async (req, res) => {
  const platform = clientPlatform(req);
  if (!platform) return res.json([]);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { registrationDate: true } });
  const announcements = await prisma.ownerAnnouncement.findMany({
    where: { createdAt: { gte: user.registrationDate }, platforms: { has: platform }, dismissals: { none: { userId: req.auth!.userId } } },
    include: { createdBy: { select: { username: true } } },
    orderBy: { createdAt: "asc" }, take: 20
  });
  res.json(announcements.map(item => ({ id: item.id, title: item.title, body: item.body, createdAt: item.createdAt, by: item.createdBy.username })));
}));

router.post("/announcements/:id/dismiss", authenticate, asyncRoute(async (req, res) => {
  const announcement = await prisma.ownerAnnouncement.findUnique({ where: { id: req.params.id as string }, select: { id: true } });
  if (!announcement) return res.status(404).json({ error: "Announcement not found" });
  await prisma.ownerAnnouncementDismissal.upsert({
    where: { announcementId_userId: { announcementId: announcement.id, userId: req.auth!.userId } },
    create: { announcementId: announcement.id, userId: req.auth!.userId }, update: { dismissedAt: new Date() }
  });
  res.status(204).end();
}));

router.post("/push-token", authenticate, asyncRoute(async (req, res) => {
  const { token, platform } = z.object({ token: z.string().trim().min(20).max(500), platform: z.enum(["android", "ios"]) }).strict().parse(req.body);
  if (!/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token)) return res.status(400).json({ error: "Invalid Expo push token" });
  await prisma.pushToken.upsert({ where: { token }, create: { token, platform, userId: req.auth!.userId }, update: { platform, userId: req.auth!.userId } });
  res.status(204).end();
}));

router.delete("/push-token", authenticate, asyncRoute(async (req, res) => {
  const { token } = z.object({ token: z.string().min(20).max(500) }).strict().parse(req.body);
  await prisma.pushToken.deleteMany({ where: { token, userId: req.auth!.userId } });
  res.status(204).end();
}));

export default router;
