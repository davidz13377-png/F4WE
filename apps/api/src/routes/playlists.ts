import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { Rank } from "@prisma/client";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { songView } from "../services/catalog.js";
import { beginDirectUpload, completeDirectUpload, deleteImage, saveImage } from "../services/storage.js";
import { isStaff } from "../services/staffPlaylist.js";

const router = Router();
const pictureUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const directUploadRequest = z.object({ mimeType: z.string().min(1).max(100), size: z.number().int().positive().optional() }).strict();
const directUploadCompletion = z.object({ uploadToken: z.string().min(1).max(5000) }).strict();
router.use(authenticate);
const input = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), isPublic: z.boolean().default(false) });
const accessible = (userId: string, seePrivate = false, staffAccess = false) => ({ AND: [
  ...(staffAccess ? [] : [{ isStaffPlaylist: false }]),
  ...(seePrivate ? [] : [{ OR: [{ isPublic: true }, { creatorId: userId }, { collaborators: { some: { userId } } }, ...(staffAccess ? [{ isStaffPlaylist: true }] : [])] }])
] });
const creator = { select: { id: true, username: true, rank: true } } as const;
async function editablePlaylist(albumId: string, userId: string) {
  return prisma.album.findFirst({ where: { id: albumId, isStaffPlaylist: false, OR: [{ creatorId: userId }, { collaborators: { some: { userId } } }] } });
}

router.get("/", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const seePrivate = req.auth!.isOwner || req.auth!.rank === Rank.Developer;
  const staffAccess = isStaff(req.auth!.rank, req.auth!.isOwner);
  const q = z.string().trim().max(100).parse(req.query.q ?? "");
  const rows = await prisma.album.findMany({
    where: { AND: [accessible(userId, seePrivate, staffAccess), ...(req.query.mine === "true" ? [{ creatorId: userId, isStaffPlaylist: false }] : []),
      ...(req.query.library === "true" ? [{ OR: [{ creatorId: userId }, { collaborators: { some: { userId } } }, { savedBy: { some: { userId } } }, ...(staffAccess ? [{ isStaffPlaylist: true }] : [])] }] : []),
      ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] },
    orderBy: { creationDate: "desc" },
    include: { creator, savedBy: { where: { userId }, select: { userId: true } }, collaborators: { where: { userId }, select: { userId: true } } }
  });
  res.json(rows.map(({ savedBy, collaborators, cachedTrackCount, cachedDuration, ...playlist }) => ({ ...playlist, trackCount: cachedTrackCount, totalDuration: cachedDuration, saved: !!savedBy.length, canEdit: playlist.creatorId === userId || !!collaborators.length })));
}));

router.post("/", asyncRoute(async (req, res) => {
  const data = input.parse(req.body);
  const playlist = await prisma.album.create({ data: { ...data, creatorId: req.auth!.userId }, include: { creator } });
  res.status(201).json({ ...playlist, trackCount: 0, totalDuration: 0, saved: false, canEdit: true });
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const data = input.partial().strict().parse(req.body);
  const result = await prisma.album.updateMany({ where: { id: req.params.id as string, creatorId: req.auth!.userId, isStaffPlaylist: false }, data });
  if (!result.count) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  if (data.isPublic === false) await prisma.savedAlbum.deleteMany({ where: { albumId: req.params.id as string, userId: { not: req.auth!.userId } } });
  res.json(await prisma.album.findUnique({ where: { id: req.params.id as string }, include: { creator } }));
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId;
  const seePrivate = req.auth!.isOwner || req.auth!.rank === Rank.Developer;
  const staffAccess = isStaff(req.auth!.rank, req.auth!.isOwner);
  const playlist = await prisma.album.findFirst({
    where: { id: req.params.id as string, ...accessible(userId, seePrivate, staffAccess) },
    include: { creator, savedBy: { where: { userId }, select: { userId: true } }, collaborators: { include: { user: { select: { id: true, username: true, rank: true, profilePicture: true } } }, orderBy: { addedAt: "asc" } },
      songs: { orderBy: [{ order: "asc" }, { musicId: "asc" }], include: { music: { include: { favorites: { where: { userId }, select: { userId: true } } } } } } }
  });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  const { savedBy, songs, cachedTrackCount, cachedDuration, collaborators, ...details } = playlist;
  res.json({ ...details, saved: !!savedBy.length, trackCount: cachedTrackCount, totalDuration: cachedDuration, canEdit: playlist.creatorId === userId || collaborators.some(item => item.userId === userId), collaborators: collaborators.map(item => item.user), songs: songs.map(item => songView(item.music)) });
}));

router.post("/:id/picture/upload-url", asyncRoute(async (req, res) => {
  const playlist = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
  const input = directUploadRequest.parse(req.body);
  res.json(await beginDirectUpload("playlist", req.auth!.userId, input.mimeType, input.size));
}));

router.post("/:id/picture/complete", asyncRoute(async (req, res) => {
  const playlist = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
  const { uploadToken } = directUploadCompletion.parse(req.body);
  const uploaded = await completeDirectUpload("playlist", req.auth!.userId, uploadToken);
  try {
    await prisma.album.update({ where: { id: playlist.id }, data: { artworkUrl: uploaded.url } });
  } catch (error) {
    await deleteImage(uploaded.url, "playlist");
    throw error;
  }
  await deleteImage(playlist.artworkUrl, "playlist");
  res.json({ artworkUrl: uploaded.url });
}));

router.post("/:id/picture", pictureUpload.single("file"), asyncRoute(async (req, res) => {
  const playlist = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (playlist.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can change this playlist" });
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
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
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
  await prisma.album.update({ where: { id: playlist.id }, data: { artworkUrl: null } });
  await deleteImage(playlist.artworkUrl, "playlist");
  res.status(204).end();
}));

router.post("/:id/songs", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const { musicId } = z.object({ musicId: z.string().min(1).max(100) }).parse(req.body);
  const playlist = await prisma.album.findUnique({ where: { id: albumId } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (!await editablePlaylist(albumId, req.auth!.userId)) return res.status(403).json({ error: "Only the creator or a collaborator can edit this playlist" });
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
  if (!await prisma.music.findUnique({ where: { id: musicId }, select: { id: true } })) return res.status(404).json({ error: "Song not found" });
  await prisma.$transaction(async tx => {
    // Lock the parent so concurrent additions cannot exceed the limit or reorder songs.
    await tx.$queryRaw`SELECT id FROM "Album" WHERE id = ${albumId} FOR UPDATE`;
    if (await tx.albumSong.findUnique({ where: { albumId_musicId: { albumId, musicId } } })) return;
    const count = await tx.albumSong.count({ where: { albumId } });
    if (count >= 500) throw Object.assign(new Error("A playlist can contain at most 500 songs"), { status: 409 });
    const last = await tx.albumSong.findFirst({ where: { albumId }, orderBy: { order: "desc" } });
    const music = await tx.music.findUniqueOrThrow({ where: { id: musicId }, select: { duration: true } });
    await tx.albumSong.create({ data: { albumId, musicId, order: (last?.order ?? -1) + 1 } });
    await tx.album.update({ where: { id: albumId }, data: { cachedTrackCount: { increment: 1 }, cachedDuration: { increment: music.duration ?? 0 } } });
  });
  res.status(204).end();
}));

router.delete("/:id/songs/:musicId", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const playlist = await prisma.album.findUnique({ where: { id: albumId } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  if (!await editablePlaylist(albumId, req.auth!.userId)) return res.status(403).json({ error: "Only the creator or a collaborator can edit this playlist" });
  if (playlist.isStaffPlaylist) return res.status(403).json({ error: "The Staff Playlist is maintained automatically" });
  const musicId = req.params.musicId as string;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Album" WHERE id = ${albumId} FOR UPDATE`;
    const row = await tx.albumSong.findUnique({ where: { albumId_musicId: { albumId, musicId } }, include: { music: { select: { duration: true } } } });
    if (!row) return;
    await tx.albumSong.delete({ where: { albumId_musicId: { albumId, musicId } } });
    await tx.album.update({ where: { id: albumId }, data: { cachedTrackCount: { decrement: 1 }, cachedDuration: { decrement: row.music.duration ?? 0 } } });
  });
  res.status(204).end();
}));

router.put("/:id/order", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const { musicIds } = z.object({ musicIds: z.array(z.string().min(1).max(100)).max(500) }).strict().parse(req.body);
  if (new Set(musicIds).size !== musicIds.length) return res.status(400).json({ error: "Song order contains duplicates" });
  if (!await editablePlaylist(albumId, req.auth!.userId)) return res.status(403).json({ error: "Only the creator or a collaborator can edit this playlist" });
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Album" WHERE id = ${albumId} FOR UPDATE`;
    const existing = await tx.albumSong.findMany({ where: { albumId }, select: { musicId: true } });
    if (existing.length !== musicIds.length || existing.some(item => !musicIds.includes(item.musicId))) throw Object.assign(new Error("The order must contain every playlist song exactly once"), { status: 400 });
    await Promise.all(musicIds.map((musicId, order) => tx.albumSong.update({ where: { albumId_musicId: { albumId, musicId } }, data: { order } })));
  });
  res.status(204).end();
}));

router.post("/:id/collaborators", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  const { username } = z.object({ username: z.string().trim().min(1).max(32) }).strict().parse(req.body);
  const playlist = await prisma.album.findFirst({ where: { id: albumId, creatorId: req.auth!.userId, isStaffPlaylist: false } });
  if (!playlist) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  const friend = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" }, friendedBy: { some: { userId: req.auth!.userId } } }, select: { id: true, username: true, rank: true, profilePicture: true } });
  if (!friend) return res.status(404).json({ error: "Only an accepted friend can be invited" });
  await prisma.playlistCollaborator.upsert({ where: { albumId_userId: { albumId, userId: friend.id } }, create: { albumId, userId: friend.id }, update: {} });
  res.status(201).json(friend);
}));

router.delete("/:id/collaborators/:userId", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  if (!await prisma.album.findFirst({ where: { id: albumId, creatorId: req.auth!.userId, isStaffPlaylist: false }, select: { id: true } })) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  await prisma.playlistCollaborator.deleteMany({ where: { albumId, userId: req.params.userId as string } });
  res.status(204).end();
}));

router.post("/:id/save", asyncRoute(async (req, res) => {
  const userId = req.auth!.userId, albumId = req.params.id as string;
  const seePrivate = req.auth!.isOwner || req.auth!.rank === Rank.Developer;
  const staffAccess = isStaff(req.auth!.rank, req.auth!.isOwner);
  if (!await prisma.album.findFirst({ where: { id: albumId, isStaffPlaylist: false, ...accessible(userId, seePrivate, staffAccess) }, select: { id: true } })) return res.status(404).json({ error: "Playlist not found" });
  await prisma.savedAlbum.upsert({ where: { userId_albumId: { userId, albumId } }, create: { userId, albumId }, update: {} });
  res.status(204).end();
}));

router.delete("/:id/save", asyncRoute(async (req, res) => {
  await prisma.savedAlbum.deleteMany({ where: { userId: req.auth!.userId, albumId: req.params.id as string } });
  res.status(204).end();
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const result = await prisma.album.deleteMany({ where: { id: req.params.id as string, creatorId: req.auth!.userId, isStaffPlaylist: false } });
  if (!result.count) return res.status(404).json({ error: "Playlist not found or not owned by you" });
  res.status(204).end();
}));

export default router;
