import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
config({ path: envPath, override: true });

export const env = z.object({
  DATABASE_URL: z.string().url(),
  API_UPLOAD_DIR: z.string().default("../api/uploads"),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  YT_DLP_BIN: z.string().default("yt-dlp"),
  FFMPEG_BIN: z.string().default("ffmpeg"),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_SERVER_ID: z.string().min(1),
  AUTHORIZED_USER_IDS: z.string().min(1),
  AUTHORIZED_USER_RANKS: z.string().min(1),
  BUG_REPORT_LOG_CHANNEL: z.string().min(1),
  MUSIC_REQUEST_LOG_CHANNEL: z.string().min(1),
  USER_REGISTRATION_LOG_CHANNEL: z.string().min(1),
  KEY_GENERATION_LOG_CHANNEL: z.string().min(1),
  MUSIC_UPLOAD_LOG_CHANNEL: z.string().min(1),
  RANK_CHANGE_LOG_CHANNEL: z.string().min(1),
  DEBUG_LOG_CHANNEL: z.string().min(1).default("1550942743927201974")
}).superRefine((value, ctx) => {
  if (value.STORAGE_DRIVER !== "r2") return;
  for (const field of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const) {
    if (!value[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required when STORAGE_DRIVER=r2` });
  }
}).parse(process.env);

const ids = env.AUTHORIZED_USER_IDS.split(",").map(v => v.trim()).filter(Boolean);
const ranks = env.AUTHORIZED_USER_RANKS.split(",").map(v => v.trim()).filter(Boolean);
if (ids.length !== ranks.length) {
  throw new Error(`AUTHORIZED_USER_IDS and AUTHORIZED_USER_RANKS mismatch: ${ids.length} ID(s), ${ranks.length} rank(s). Loaded from: ${envPath}`);
}
export const authorized = new Map(ids.map((id, i) => [id, ranks[i]!]));
