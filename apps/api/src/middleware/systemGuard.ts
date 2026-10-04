import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { env } from "../env.js";

let cached: { expires: number; minimumVersion: string; maintenanceEnabled: boolean; maintenanceMessage: string; updateMessage: string } | null = null;

function olderThan(current: string, minimum: string) {
  const parse = (value: string) => value.split(/[.+-]/).slice(0, 3).map(part => Number(part) || 0);
  const a = parse(current), b = parse(minimum);
  for (let index = 0; index < 3; index++) if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0);
  return false;
}

async function settings() {
  if (cached && cached.expires > Date.now()) return cached;
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ["app.minimum_version", "app.update_message", "app.maintenance_enabled", "app.maintenance_message"] } } });
  const map = new Map(rows.map(row => [row.key, row.value]));
  cached = {
    expires: Date.now() + 5_000,
    minimumVersion: map.get("app.minimum_version") || "1.0.0",
    maintenanceEnabled: map.get("app.maintenance_enabled") === "true",
    updateMessage: map.get("app.update_message") || "A new F4WE update is available. Please update the application to continue.",
    maintenanceMessage: map.get("app.maintenance_message") || "F4WE is currently under maintenance. Please try again soon."
  };
  return cached;
}

export async function systemGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const value = await settings();
    // Builds released before version headers existed are the original 1.0.0 APK.
    const version = String(req.headers["x-f4we-version"] || "1.0.0");
    if (olderThan(version, value.minimumVersion)) return res.status(426).json({ error: value.updateMessage, code: "APP_UPDATE_REQUIRED", minimumVersion: value.minimumVersion, downloadUrl: "https://f4we.xyz/" });
    if (value.maintenanceEnabled) {
      // Keep login reachable so an Owner can authenticate and turn maintenance off.
      if (req.method === "POST" && req.path === "/auth/login") return next();
      let owner = false;
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (token) {
        try {
          const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: "music-box-api" }) as { sub: string };
          owner = !!(await prisma.user.findUnique({ where: { id: decoded.sub }, select: { isOwner: true } }))?.isOwner;
        } catch { /* Normal auth middleware will report invalid sessions. */ }
      }
      if (!owner) return res.status(503).json({ error: value.maintenanceMessage, code: "MAINTENANCE" });
    }
    next();
  } catch (error) { next(error); }
}
