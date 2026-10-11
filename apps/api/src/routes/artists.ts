import { Router } from "express";
import { Rank } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate, requireRank } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { songView } from "../services/catalog.js";
import { beginDirectUpload, completeDirectUpload, deleteImage } from "../services/storage.js";

const router = Router();
router.use(authenticate);

const staff = requireRank(Rank.Moderator, Rank.Admin, Rank.Developer);
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const dateInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must use YYYY-MM-DD").refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Release date is not valid");
const artistInput = z.object({
  name: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(2_000).nullable().optional(),
  imageUrl: z.string().url().max(2_000).nullable().optional(),
  heroUrl: z.string().url().max(2_000).nullable().optional()
}).strict();
const releaseInput = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2_000).nullable().optional(),
  artworkUrl: z.string().url().max(2_000).nullable().optional(),
  releaseDate: dateInput.nullable().optional(),
  type: z.enum(["Album", "EP", "Single"]).default("Album"),
  songIds: z.array(z.string().min(1).max(100)).max(200).default([])
}).strict();
const releasePatchInput = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  artworkUrl: z.string().url().max(2_000).nullable().optional(),
  releaseDate: dateInput.nullable().optional(),
  type: z.enum(["Album", "EP", "Single"]).optional(),
  songIds: z.array(z.string().min(1).max(100)).max(200).optional()
}).strict();
const directUploadRequest = z.object({
  category: z.enum(["artist", "release-artwork"]),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().optional()
}).strict();

function releaseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : value === null ? null : undefined;
}

async function releaseView(releaseId: string, userId: string) {
  const release = await prisma.catalogRelease.findUnique({
    where: { id: releaseId },
    include: {
      artist: true,
      tracks: { orderBy: [{ order: "asc" }, { musicId: "asc" }], include: { music: { include: { favorites: { where: { userId }, select: { userId: true } } } } } }
    }
  });
  if (!release) return null;
  return { ...release, tracks: release.tracks.map(item => songView(item.music)) };
}

router.get("/", asyncRoute(async (req, res) => {
  const q = z.string().trim().max(100).catch("").parse(req.query.q ?? "");
  const limit = z.coerce.number().int().min(1).max(100).catch(40).parse(req.query.limit ?? 40);
  const artists = await prisma.catalogArtist.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: [{ verified: "desc" }, { name: "asc" }],
    take: limit,
    include: {
      _count: { select: { releases: true, music: true } },
      releases: { orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }], take: 1 }
    }
  });
  res.json(artists.map(({ _count, ...artist }) => ({ ...artist, releaseCount: _count.releases, trackCount: _count.music })));
}));

router.get("/featured", asyncRoute(async (_req, res) => {
  const release = await prisma.catalogRelease.findFirst({
    where: { artworkUrl: { not: null } },
    orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
    include: { artist: true, _count: { select: { tracks: true } } }
  });
  res.json(release ? { ...release, trackCount: release._count.tracks } : null);
}));

router.get("/releases", asyncRoute(async (req, res) => {
  const q = z.string().trim().max(100).catch("").parse(req.query.q ?? "");
  const releases = await prisma.catalogRelease.findMany({
    where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { artist: { name: { contains: q, mode: "insensitive" } } }] } : undefined,
    orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }], take: 100,
    include: { artist: true, _count: { select: { tracks: true } } }
  });
  res.json(releases.map(({ _count, ...release }) => ({ ...release, trackCount: _count.tracks })));
}));

router.get("/releases/:releaseId", asyncRoute(async (req, res) => {
  const release = await releaseView(req.params.releaseId as string, req.auth!.userId);
  if (!release) return res.status(404).json({ error: "Album not found" });
  res.json(release);
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const artist = await prisma.catalogArtist.findUnique({
    where: { id: req.params.id as string },
    include: {
      releases: {
        orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        include: { _count: { select: { tracks: true } } }
      },
      music: {
        orderBy: { uploadDate: "desc" }, take: 100,
        include: { favorites: { where: { userId: req.auth!.userId }, select: { userId: true } } }
      }
    }
  });
  if (!artist) return res.status(404).json({ error: "Artist not found" });
  res.json({ ...artist, releases: artist.releases.map(({ _count, ...release }) => ({ ...release, trackCount: _count.tracks })), music: artist.music.map(songView) });
}));

router.post("/assets/upload-url", staff, asyncRoute(async (req, res) => {
  const input = directUploadRequest.parse(req.body);
  res.json(await beginDirectUpload(input.category, req.auth!.userId, input.mimeType, input.size));
}));

router.post("/assets/complete", staff, asyncRoute(async (req, res) => {
  const input = z.object({ category: z.enum(["artist", "release-artwork"]), uploadToken: z.string().min(1).max(5_000) }).strict().parse(req.body);
  const uploaded = input.category === "artist"
    ? await completeDirectUpload("artist", req.auth!.userId, input.uploadToken)
    : await completeDirectUpload("release-artwork", req.auth!.userId, input.uploadToken);
  res.json(uploaded);
}));

router.post("/", staff, asyncRoute(async (req, res) => {
  const input = artistInput.parse(req.body);
  const normalizedName = normalize(input.name);
  if (await prisma.catalogArtist.findUnique({ where: { normalizedName }, select: { id: true } })) return res.status(409).json({ error: "This artist already exists" });
  const artist = await prisma.catalogArtist.create({ data: {
    name: input.name, normalizedName, bio: input.bio || null, imageUrl: input.imageUrl || null,
    heroUrl: input.heroUrl || null, createdById: req.auth!.userId
  } });
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.artist_created", { artistId: artist.id, name: artist.name });
  res.status(201).json(artist);
}));

router.patch("/:id", staff, asyncRoute(async (req, res) => {
  const input = artistInput.partial().parse(req.body);
  const current = await prisma.catalogArtist.findUnique({ where: { id: req.params.id as string } });
  if (!current) return res.status(404).json({ error: "Artist not found" });
  const normalizedName = input.name === undefined ? undefined : normalize(input.name);
  if (normalizedName && await prisma.catalogArtist.findFirst({ where: { normalizedName, id: { not: current.id } }, select: { id: true } })) return res.status(409).json({ error: "This artist already exists" });
  const artist = await prisma.catalogArtist.update({ where: { id: current.id }, data: {
    name: input.name, normalizedName, bio: input.bio, imageUrl: input.imageUrl, heroUrl: input.heroUrl
  } });
  if (input.imageUrl !== undefined && input.imageUrl !== current.imageUrl) await deleteImage(current.imageUrl, "artist");
  if (input.heroUrl !== undefined && input.heroUrl !== current.heroUrl) await deleteImage(current.heroUrl, "artist");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.artist_updated", { artistId: artist.id, name: artist.name });
  res.json(artist);
}));

router.delete("/:id", staff, asyncRoute(async (req, res) => {
  const artist = await prisma.catalogArtist.findUnique({ where: { id: req.params.id as string }, include: { releases: { select: { artworkUrl: true } } } });
  if (!artist) return res.status(404).json({ error: "Artist not found" });
  await prisma.catalogArtist.delete({ where: { id: artist.id } });
  await Promise.all([deleteImage(artist.imageUrl, "artist"), deleteImage(artist.heroUrl, "artist"), ...artist.releases.map(item => deleteImage(item.artworkUrl, "release-artwork"))]);
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.artist_deleted", { artistId: artist.id, name: artist.name });
  res.status(204).end();
}));

router.post("/:id/releases", staff, asyncRoute(async (req, res) => {
  const artistId = req.params.id as string;
  const input = releaseInput.parse(req.body);
  if (new Set(input.songIds).size !== input.songIds.length) return res.status(400).json({ error: "The album track list contains duplicates" });
  if (!await prisma.catalogArtist.findUnique({ where: { id: artistId }, select: { id: true } })) return res.status(404).json({ error: "Artist not found" });
  const normalizedTitle = normalize(input.title);
  if (await prisma.catalogRelease.findUnique({ where: { artistId_normalizedTitle: { artistId, normalizedTitle } }, select: { id: true } })) return res.status(409).json({ error: "This artist already has an album with that title" });
  const musicCount = await prisma.music.count({ where: { id: { in: input.songIds } } });
  if (musicCount !== input.songIds.length) return res.status(400).json({ error: "One or more selected songs no longer exist" });
  const release = await prisma.$transaction(async tx => {
    const created = await tx.catalogRelease.create({ data: {
      artistId, title: input.title, normalizedTitle, description: input.description || null,
      artworkUrl: input.artworkUrl || null, releaseDate: releaseDate(input.releaseDate), type: input.type,
      createdById: req.auth!.userId,
      tracks: { create: input.songIds.map((musicId, order) => ({ musicId, order })) }
    } });
    if (input.songIds.length) await tx.music.updateMany({ where: { id: { in: input.songIds } }, data: { catalogArtistId: artistId } });
    return created;
  });
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.release_created", { artistId, releaseId: release.id, title: release.title, trackCount: input.songIds.length });
  res.status(201).json(await releaseView(release.id, req.auth!.userId));
}));

router.patch("/releases/:releaseId", staff, asyncRoute(async (req, res) => {
  const input = releasePatchInput.parse(req.body);
  const current = await prisma.catalogRelease.findUnique({ where: { id: req.params.releaseId as string } });
  if (!current) return res.status(404).json({ error: "Album not found" });
  if (input.songIds && new Set(input.songIds).size !== input.songIds.length) return res.status(400).json({ error: "The album track list contains duplicates" });
  if (input.songIds && await prisma.music.count({ where: { id: { in: input.songIds } } }) !== input.songIds.length) return res.status(400).json({ error: "One or more selected songs no longer exist" });
  const normalizedTitle = input.title === undefined ? undefined : normalize(input.title);
  if (normalizedTitle && await prisma.catalogRelease.findFirst({ where: { artistId: current.artistId, normalizedTitle, id: { not: current.id } }, select: { id: true } })) return res.status(409).json({ error: "This artist already has an album with that title" });
  await prisma.$transaction(async tx => {
    if (input.songIds) {
      await tx.catalogReleaseTrack.deleteMany({ where: { releaseId: current.id } });
      if (input.songIds.length) {
        await tx.catalogReleaseTrack.createMany({ data: input.songIds.map((musicId, order) => ({ releaseId: current.id, musicId, order })) });
        await tx.music.updateMany({ where: { id: { in: input.songIds } }, data: { catalogArtistId: current.artistId } });
      }
    }
    await tx.catalogRelease.update({ where: { id: current.id }, data: {
      title: input.title, normalizedTitle, description: input.description, artworkUrl: input.artworkUrl,
      releaseDate: releaseDate(input.releaseDate), type: input.type
    } });
  });
  if (input.artworkUrl !== undefined && input.artworkUrl !== current.artworkUrl) await deleteImage(current.artworkUrl, "release-artwork");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.release_updated", { releaseId: current.id });
  res.json(await releaseView(current.id, req.auth!.userId));
}));

router.delete("/releases/:releaseId", staff, asyncRoute(async (req, res) => {
  const release = await prisma.catalogRelease.findUnique({ where: { id: req.params.releaseId as string } });
  if (!release) return res.status(404).json({ error: "Album not found" });
  await prisma.catalogRelease.delete({ where: { id: release.id } });
  await deleteImage(release.artworkUrl, "release-artwork");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "catalog.release_deleted", { releaseId: release.id, title: release.title });
  res.status(204).end();
}));

export default router;
