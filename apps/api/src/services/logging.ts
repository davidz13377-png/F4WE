import { prisma } from "../db.js";

export type LogType =
  | "BUG_REPORT"
  | "MUSIC_REQUEST"
  | "USER_REGISTRATION"
  | "KEY_GENERATION"
  | "MUSIC_UPLOAD"
  | "RANK_CHANGE"
  | "DEBUG";

export async function audit(type: LogType, userId: string | null, actionType: string, details: object) {
  await prisma.logEvent.create({ data: { type, userId, actionType, details } });
}
