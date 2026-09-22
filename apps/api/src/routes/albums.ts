import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";

const router = Router();
router.use(authenticate);

const albumInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  artworkUrl: z.string().url().optional(),
  isPublic: z.boolean().default(false),
  songIds: z.array(z.string()).max(500).default([])
});

router.get("/", asyncRoute(async (req, res) => {
  const mine = req.query.mine === "true";
  const albums = await prisma.album.findMany({
    where: mine ? { creatorId: req.auth!.userId } : { OR: [{ isPublic: true }, { creatorId: req.auth!.userId }] },
    orderBy: { creationDate: "desc" },
    include: {
      creator: { select: { id: true, username: true, rank: true } },
      songs: { orderBy: { order: "asc" }, include: { music: true } },
      savedBy: { where: { userId: req.auth!.userId }, select: { userId: true } }
    }
  });
  res.json(albums.map(({ savedBy, ...album }) => ({ ...album, saved: savedBy.length > 0 })));
}));

router.post("/", asyncRoute(async (req, res) => {
  const input = albumInput.parse(req.body);
  const album = await prisma.album.create({
    data: {
      name: input.name, description: input.description, artworkUrl: input.artworkUrl,
      isPublic: input.isPublic, creatorId: req.auth!.userId,
      songs: { create: input.songIds.map((musicId, order) => ({ musicId, order })) }
    },
    include: { songs: { include: { music: true } } }
  });
  res.status(201).json(album);
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  const existing = await prisma.album.findUnique({ where: { id: req.params.id as string } });
  if (!existing) return res.status(404).json({ error: "Album not found" });
  if (existing.creatorId !== req.auth!.userId) return res.status(403).json({ error: "Only the creator can edit this album" });
  const input = albumInput.partial().parse(req.body);
  const album = await prisma.$transaction(async tx => {
    if (input.songIds) {
      await tx.albumSong.deleteMany({ where: { albumId: existing.id } });
      await tx.albumSong.createMany({ data: input.songIds.map((musicId, order) => ({ albumId: existing.id, musicId, order })) });
    }
    return tx.album.update({ where: { id: existing.id }, data: { name: input.name, description: input.description, artworkUrl: input.artworkUrl, isPublic: input.isPublic } });
  });
  if (input.isPublic === false) await prisma.savedAlbum.deleteMany({ where: { albumId: existing.id, userId: { not: req.auth!.userId } } });
  res.json(album);
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const result = await prisma.album.deleteMany({ where: { id: req.params.id as string, creatorId: req.auth!.userId } });
  if (!result.count) return res.status(404).json({ error: "Album not found" });
  res.status(204).end();
}));

router.post("/:id/save", asyncRoute(async (req, res) => {
  const albumId = req.params.id as string;
  if (!await prisma.album.findFirst({ where: { id: albumId, OR: [{ isPublic: true }, { creatorId: req.auth!.userId }] }, select: { id: true } })) return res.status(404).json({ error: "Playlist not found" });
  await prisma.savedAlbum.upsert({ where: { userId_albumId: { userId: req.auth!.userId, albumId } }, create: { userId: req.auth!.userId, albumId }, update: {} });
  res.status(204).end();
}));

router.delete("/:id/save", asyncRoute(async (req, res) => {
  await prisma.savedAlbum.deleteMany({ where: { userId: req.auth!.userId, albumId: req.params.id as string } });
  res.status(204).end();
}));

export default router;
