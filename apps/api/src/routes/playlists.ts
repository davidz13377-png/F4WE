import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { songView } from "../services/catalog.js";
import { deleteImage, saveImage } from "../services/storage.js";

const router = Router();
const pictureUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.use(authenticate);
const input = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), isPublic: z.boolean().default(false) });
const accessible = (userId: string) => ({ OR: [{ isPublic: true }, { creatorId: userId }] });
const creator = { select: { id: true, username: true, rank: true } } as const;

router.get("/", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const q = z.string().trim().max(100).parse(req.query.q ?? "");
  const rows = await prisma.album.findMany({
    where: { AND: [accessible(userId), ...(req.query.mine === "true" ? [{ creatorId: userId }] : []),
      ...(req.query.library === "true" ? [{ OR: [{ creatorId: userId }, { savedBy: { some: { userId } } }] }] : []),
      ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] },
    orderBy: { creationDate: "desc" },
    include: { creator, _count: { select: { songs: true } }, savedBy: { where: { userId }, select: { userId: true } } }
  });
  res.json(rows.map(({ savedBy, _count, ...playlist }) => ({ ...playlist, trackCount: _count.songs, saved: !!savedBy.length })));
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = input.parse(req.body);
  const playlist = await prisma.album.create({ data: { ...data, creatorId: req.auth!.userId }, include: { creator } });
  res.status(201).json({ ...playlist, trackCount: 0, saved: false });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const data = input.partial().strict().parse(req.body);
  const result = await prisma.album.updateMany({ where: { id: req.params.id as string, creatorId: req.auth!.userId }, data });
  if (!result.count) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  if (data.isPublic === false) await prisma.savedAlbum.deleteMany({ where: { albumId: req.params.id as string, userId: { not: req.auth!.userId } } });
  res.json(await prisma.album.findUnique({ where: { id: req.params.id as string }, include: { creator } }));
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const playlist = await prisma.album.findFirst({
    where: { id: req.params.id as string, ...accessible(userId) },
    include: { creator, savedBy: { where: { userId }, select: { userId: true } },
      songs: { orderBy: [{ order: "asc" }, { musicId: "asc" }], include: { music: { include: { favorites: { where: { userId }, select: { userId: true } } } } } } }
  });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  const { savedBy, songs, ...details } = playlist;
  res.json({ ...details, saved: !!savedBy.length, trackCount: songs.length, songs: songs.map(item => songView(item.music)) });
}));

router.post("/:id/picture", pictureUpload.single("file"), asyncRoute(async (req, res) => {
  const playlist = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  if (!req.file) return res.status(400).json({ error: "Image file is required" });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) return res.status(415).json({ error: "Use a JPG, PNG, or WebP image" });
  const artworkUrl = await saveImage("playlist", req.file.buffer, detected.ext, detected.mime);
  try {
    await prisma.album.update({ where: { id: playlist.id }, data: { artworkUrl } });
  } catch (error) { await deleteImage(artworkUrl, "playlist"); throw error; }
  await deleteImage(playlist.artworkUrl, "playlist");
  res.json({ artworkUrl });
}));

router.delete("/:id/picture", asyncRoute(async (req, res) => {
  const playlist = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  await prisma.album.update({ where: { id: playlist.id }, data: { artworkUrl: null } });
  await deleteImage(playlist.artworkUrl, "playlist");
  res.status(204).end();
}));

router.post("/:id/songs", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const { musicId } = z.object({ musicId: z.string().min(1).max(100) }).parse(req.body);
  const playlist = await prisma.album.findUnique({ where: { id: albumId } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  if (!await prisma.music.findUnique({ where: { id: musicId }, select: { id: true } })) return res.status(404).json({ error: "Song not found" });
  await prisma.$transaction(async tx => {
    // Lock the parent so concurrent additions cannot exceed the limit or reorder songs.
    await tx.$queryRaw`SELECT id FROM "Album" WHERE id = ${albumId} FOR UPDATE`;
    if (await tx.albumSong.findUnique({ where: { albumId_musicId: { albumId, musicId } } })) return;
    const count = await tx.albumSong.count({ where: { albumId } });
    if (count >= 500) throw Object.assign(new Error("A playlist can contain at most 500 songs"), { status: 409 });
    const last = await tx.albumSong.findFirst({ where: { albumId }, orderBy: { order: "desc" } });
    await tx.albumSong.create({ data: { albumId, musicId, order: (last?.order ?? -1) + 1 } });
  });
  res.status(204).end();
}));

router.delete("/:id/songs/:musicId", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const playlist = await prisma.album.findUnique({ where: { id: albumId } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  await prisma.albumSong.deleteMany({ where: { albumId, musicId: req.params.musicId as string } });
  res.status(204).end();
}));

router.post("/:id/save", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId, albumId = req.params.id as string;
  if (!await prisma.album.findFirst({ where: { id: albumId, ...accessible(userId) }, select: { id: true } })) return res.status(404).json({ error: "Playlist not found" });
  await prisma.savedAlbum.upsert({ where: { userId_albumId: { userId, albumId } }, create: { userId, albumId }, update: {} });
  res.status(204).end();
}));

router.delete("/:id/save", asyncRoute(async (req, res) => {
  await prisma.savedAlbum.deleteMany({ where: { userId: req.auth!.userId, albumId: req.params.id as string } });
  res.status(204).end();
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const result = await prisma.album.deleteMany({ where: { id: req.params.id as string, creatorId: req.auth!.userId } });
  if (!result.count) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  res.status(204).end();
}));

export default router;
