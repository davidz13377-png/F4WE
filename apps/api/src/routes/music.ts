import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { Rank } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { authenticate, requireRank } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { songView } from "../services/catalog.js";
import { deleteImage, deleteMusic, openMusic, saveImage, saveMusic, storedMusicName } from "../services/storage.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_MP3_MB * 1024 * 1024, files: 1 } });
const artworkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.use(authenticate);

router.get("/", asyncRoute(async (req, res) => {
  const q = z.string().max(100).catch("").parse(req.query.q ?? "");
  const ids = req.query.ids === undefined ? undefined : z.string().max(2100).parse(req.query.ids).split(",");
  if (ids && (ids.length > 20 || ids.some(id => !id || id.length > 100))) return res.status(400).json({ error: "Invalid song IDs" });
  const music = await prisma.music.findMany({
    where: { ...(ids ? { id: { in: ids } } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { artist: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { uploadDate: "desc" },
    take: 100,
    include: { favorites: { where: { userId: req.auth!.userId }, select: { userId: true } } }
  });
  res.json(music.map(songView));
}));

router.get("/favorites", asyncRoute(async (req, res) => {
  const rows = await prisma.favorite.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" }, include: { music: true } });
  res.json(rows.map(row => ({ ...songView(row.music), liked: true })));
}));

router.get("/rotation", asyncRoute(async (req, res) => {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  const counts = await prisma.musicPlay.groupBy({
    by: ["musicId"], where: { userId: req.auth!.userId, playedAt: { gte: weekStart } },
    _count: { musicId: true }, orderBy: { _count: { musicId: "desc" } }, take: 3
  });
  if (!counts.length) return res.json([]);
  const songs = await prisma.music.findMany({
    where: { id: { in: counts.map(item => item.musicId) } },
    include: { favorites: { where: { userId: req.auth!.userId }, select: { userId: true } } }
  });
  const byId = new Map(songs.map(song => [song.id, song]));
  res.json(counts.flatMap(item => {
    const song = byId.get(item.musicId);
    return song ? [{ ...songView(song), playCount: item._count.musicId }] : [];
  }));
}));

router.patch("/:id", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(1).max(150),
    artist: z.string().trim().max(150).nullable()
  }).strict().parse(req.body);
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.music.update({ where: { id: song.id }, data: { title: input.title, artist: input.artist || null },
      include: { favorites: { where: { userId: req.auth!.userId }, select: { userId: true } } } });
    await tx.logEvent.create({ data: { type: "MUSIC_UPLOAD", userId: req.auth!.userId, actionType: "music.edited",
      details: { musicId: song.id, oldTitle: song.title, oldArtist: song.artist ?? null, title: result.title, artist: result.artist } } });
    return result;
  });
  res.json(songView(updated));
}));

router.post("/:id/picture", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), artworkUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required" });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !["image/png", "image/jpeg", "image/webp"].includes(detected.mime)) return res.status(415).json({ error: "Use a JPG, PNG, or WebP image" });
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const artworkUrl = await saveImage("music-artwork", req.file.buffer, detected.ext, detected.mime);
  try {
    await prisma.music.update({ where: { id: song.id }, data: { artworkUrl } });
  } catch (error) { await deleteImage(artworkUrl, "music-artwork"); throw error; }
  await deleteImage(song.artworkUrl, "music-artwork");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.artwork_updated", { musicId: song.id });
  res.json({ artworkUrl });
}));

router.delete("/:id/picture", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  await prisma.music.update({ where: { id: song.id }, data: { artworkUrl: null } });
  await deleteImage(song.artworkUrl, "music-artwork");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.artwork_removed", { musicId: song.id });
  res.status(204).end();
}));

router.delete("/:id", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  await prisma.$transaction(async tx => {
    await tx.music.delete({ where: { id: song.id } });
    await tx.logEvent.create({ data: { type: "MUSIC_UPLOAD", userId: req.auth!.userId, actionType: "music.deleted", details: { musicId: song.id, title: song.title, fileRetained: true, retainedFile: storedMusicName(song.filePath) } } });
  });
  // Keep the original MP3 on disk for recovery; DB cascades remove playlist/favorite links.
  res.status(204).end();
}));

router.post("/upload", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), upload.single("file"), asyncRoute(async (req, res) => {
  const meta = z.object({ title: z.string().trim().min(1).max(150), artist: z.string().trim().max(150).optional(), artworkUrl: z.string().url().optional() }).parse(req.body);
  if (!req.file) return res.status(400).json({ error: "MP3 file is required" });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (detected?.mime !== "audio/mpeg") return res.status(415).json({ error: "Only valid MP3 files are accepted" });
  const filePath = await saveMusic(req.file.buffer);
  let song;
  try {
    song = await prisma.music.create({ data: { ...meta, filePath, uploaderId: req.auth!.userId } });
  } catch (error) {
    await deleteMusic(filePath).catch(() => undefined);
    throw error;
  }
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.uploaded", { musicId: song.id, title: song.title, artist: song.artist });
  res.status(201).json(song);
}));

router.get("/:id/stream", asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const source = await openMusic(song.filePath, req.headers.range);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", song.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (!source) return res.status(416).end();
  if (!source.partial) {
    res.setHeader("Content-Length", source.size);
    return source.body.pipe(res);
  }
  res.status(206).set({ "Content-Range": `bytes ${source.start}-${source.end}/${source.size}`, "Content-Length": String(source.end - source.start + 1) });
  return source.body.pipe(res);
}));

router.post("/:id/like", asyncRoute(async (req, res) => {
  if (!await prisma.music.findUnique({ where: { id: req.params.id as string }, select: { id: true } })) return res.status(404).json({ error: "Song not found" });
  await prisma.favorite.upsert({
    where: { userId_musicId: { userId: req.auth!.userId, musicId: req.params.id as string } },
    create: { userId: req.auth!.userId, musicId: req.params.id as string }, update: {}
  });
  res.status(204).end();
}));

router.post("/:id/play", asyncRoute(async (req, res) => {
  const musicId = req.params.id as string;
  if (!await prisma.music.findUnique({ where: { id: musicId }, select: { id: true } })) return res.status(404).json({ error: "Song not found" });
  await prisma.musicPlay.create({ data: { userId: req.auth!.userId, musicId } });
  res.status(204).end();
}));

router.delete("/:id/like", asyncRoute(async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.auth!.userId, musicId: req.params.id as string } });
  res.status(204).end();
}));

export default router;
