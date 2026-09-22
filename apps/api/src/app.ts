import "./types.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import authRoutes from "./routes/auth.js";
import musicRoutes from "./routes/music.js";
import albumRoutes from "./routes/albums.js";
import playlistRoutes from "./routes/playlists.js";
import profileRoutes from "./routes/profile.js";
import developerRoutes from "./routes/developer.js";
import { env } from "./env.js";
import { asyncRoute, errorHandler } from "./middleware/errors.js";
import { openImage, usingR2Storage } from "./services/storage.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.CORS_ORIGINS.split(",").map(v => v.trim()), credentials: false }));
app.use(express.json({ limit: "256kb" }));
if (usingR2Storage) {
  app.get("/media/:category/:filename", asyncRoute(async (req, res) => {
    const category = req.params.category;
    if (category !== "profile" && category !== "playlist" && category !== "music-artwork") return res.status(404).json({ error: "Image not found" });
    const image = await openImage(category, req.params.filename as string);
    if (!image) return res.status(404).json({ error: "Image not found" });
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (image.length) res.setHeader("Content-Length", image.length);
    return image.body.pipe(res);
  }));
} else {
  app.use("/media/profile", express.static(path.resolve(env.UPLOAD_DIR, "profile"), { fallthrough: false, maxAge: "1d", immutable: true }));
  app.use("/media/playlist", express.static(path.resolve(env.UPLOAD_DIR, "playlist"), { fallthrough: false, maxAge: "1d", immutable: true }));
  app.use("/media/music-artwork", express.static(path.resolve(env.UPLOAD_DIR, "music-artwork"), { fallthrough: false, maxAge: "1d", immutable: true }));
}
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 25 }), authRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/developer", developerRoutes);
app.get("/health", (_req, res) => res.json({ ok: true, service: "f4we-api" }));
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);
