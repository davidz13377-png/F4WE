import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:8081"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_MP3_MB: z.coerce.number().positive().default(25),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional()
}).superRefine((value, ctx) => {
  if (value.STORAGE_DRIVER !== "r2") return;
  for (const field of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const) {
    if (!value[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required when STORAGE_DRIVER=r2` });
  }
});

export const env = schema.parse(process.env);
