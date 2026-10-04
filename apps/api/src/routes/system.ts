import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { createBroadcastNotification } from "../services/notifications.js";

const router = Router();
const keys = ["app.minimum_version", "app.update_message", "app.maintenance_enabled", "app.maintenance_message"];

async function status() {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const values = new Map(rows.map(row => [row.key, row.value]));
  return {
    minimumVersion: values.get("app.minimum_version") || "1.0.0",
    updateMessage: values.get("app.update_message") || "A new F4WE update is available. Please update the application to continue.",
    maintenanceEnabled: values.get("app.maintenance_enabled") === "true",
    maintenanceMessage: values.get("app.maintenance_message") || "F4WE is currently under maintenance. This should not take long. Please try again soon.",
    downloadUrl: "https://f4we.xyz/"
  };
}

router.get("/status", asyncRoute(async (_req, res) => res.json(await status())));

router.patch("/status", authenticate, asyncRoute(async (req, res) => {
  if (!req.auth!.isOwner) return res.status(403).json({ error: "Owner access required" });
  const input = z.object({
    minimumVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).optional(),
    updateMessage: z.string().trim().min(1).max(500).optional(),
    maintenanceEnabled: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(1).max(500).optional(),
    announceUpdate: z.boolean().optional()
  }).strict().parse(req.body);
  const updates: [string, string][] = [];
  if (input.minimumVersion !== undefined) updates.push(["app.minimum_version", input.minimumVersion]);
  if (input.updateMessage !== undefined) updates.push(["app.update_message", input.updateMessage]);
  if (input.maintenanceEnabled !== undefined) updates.push(["app.maintenance_enabled", String(input.maintenanceEnabled)]);
  if (input.maintenanceMessage !== undefined) updates.push(["app.maintenance_message", input.maintenanceMessage]);
  await prisma.$transaction(updates.map(([key, value]) => prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } })));
  if (input.announceUpdate && input.minimumVersion) {
    await createBroadcastNotification("F4WE update available", input.updateMessage || "A new version of F4WE is available. Update now to continue.", { type: "app_update", url: "https://f4we.xyz/" });
  }
  res.json(await status());
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
