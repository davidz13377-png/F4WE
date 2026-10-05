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
import { notifyUser } from "../services/realtime.js";
import { songView } from "../services/catalog.js";
import { beginDirectUpload, completeDirectUpload, cutMusic, deleteImage, deleteMusic, mp3DurationSeconds, openMusic, saveImage, saveMusic, storedMusicName } from "../services/storage.js";
import { addSongToStaffPlaylist } from "../services/staffPlaylist.js";
import { musicIdentity } from "../services/musicIdentity.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_MP3_MB * 1024 * 1024, files: 1 } });
const artworkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const directUploadRequest = z.object({ mimeType: z.string().min(1).max(100), size: z.number().int().positive().optional() }).strict();
const directUploadCompletion = z.object({ uploadToken: z.string().min(1).max(5000) }).strict();
const releaseDateInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must use YYYY-MM-DD").refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Release date is not valid");
const releaseDateValue = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : value === null ? null : undefined;

router.use(authenticate);

const normalizedDuplicate = async (title: string, artist?: string | null, excludeId?: string) => prisma.music.findFirst({
  where: { ...musicIdentity(title, artist), ...(excludeId ? { id: { not: excludeId } } : {}) },
  select: { id: true, title: true, artist: true, artworkUrl: true }
});

router.get("/count", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (_req, res) => {
  res.json({ count: await prisma.music.count() });
}));

router.get("/duplicate", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const query = z.object({ title: z.string().trim().min(1).max(150), artist: z.string().trim().max(150).optional() }).parse(req.query);
  res.json({ duplicate: await normalizedDuplicate(query.title, query.artist) });
}));

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

router.get("/:id/info", asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string }, select: { id: true, title: true, artist: true, uploadDate: true, releaseDate: true, duration: true, _count: { select: { plays: true } } } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  res.json({ id: song.id, title: song.title, artist: song.artist, uploadDate: song.uploadDate, releaseDate: song.releaseDate, duration: song.duration, playCount: song._count.plays });
}));

router.patch("/:id", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(1).max(150),
    artist: z.string().trim().max(150).nullable(),
    releaseDate: releaseDateInput.nullable().optional()
  }).strict().parse(req.body);
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const duplicate = await normalizedDuplicate(input.title, input.artist, song.id);
  if (duplicate) return res.status(409).json({ error: "A song with this title and artist already exists", duplicate });
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.music.update({ where: { id: song.id }, data: { title: input.title, artist: input.artist || null, ...musicIdentity(input.title, input.artist), ...(input.releaseDate !== undefined ? { releaseDate: releaseDateValue(input.releaseDate) } : {}) },
      include: { favorites: { where: { userId: req.auth!.userId }, select: { userId: true } } } });
    await tx.logEvent.create({ data: { type: "MUSIC_UPLOAD", userId: req.auth!.userId, actionType: "music.edited",
      details: { musicId: song.id, oldTitle: song.title, oldArtist: song.artist ?? null, title: result.title, artist: result.artist } } });
    return result;
  });
  res.json(songView(updated));
}));

router.post("/:id/picture/upload-url", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string }, select: { id: true } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const input = directUploadRequest.parse(req.body);
  res.json(await beginDirectUpload("music-artwork", req.auth!.userId, input.mimeType, input.size));
}));

router.post("/:id/picture/complete", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  const { uploadToken } = directUploadCompletion.parse(req.body);
  const uploaded = await completeDirectUpload("music-artwork", req.auth!.userId, uploadToken);
  try {
    await prisma.music.update({ where: { id: song.id }, data: { artworkUrl: uploaded.url } });
  } catch (error) {
    await deleteImage(uploaded.url, "music-artwork");
    throw error;
  }
  await deleteImage(song.artworkUrl, "music-artwork");
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.artwork_updated", { musicId: song.id });
  res.json({ artworkUrl: uploaded.url });
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

router.get("/:id/lyrics", asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string }, select: { lyrics: true, lyricsSynced: true } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  if (!song.lyrics) return res.status(404).json({ error: "Lyrics have not been added for this song yet" });
  res.json({ content: song.lyrics, type: song.lyricsSynced ? "timed" : "plain" });
}));

router.put("/:id/lyrics", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({ type: z.enum(["plain", "timed"]), content: z.string().trim().min(1).max(100_000) }).strict().parse(req.body);
  if (input.type === "timed" && !/^\s*(?:\[[^\]]+\]\s*)*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m.test(input.content)) {
    return res.status(400).json({ error: "The selected LRC file has no timed [mm:ss.xx] lyric lines" });
  }
  const result = await prisma.music.updateMany({ where: { id: req.params.id as string }, data: { lyrics: input.content, lyricsSynced: input.type === "timed" } });
  if (!result.count) return res.status(404).json({ error: "Song not found" });
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.lyrics_updated", { musicId: req.params.id, type: input.type });
  res.json({ hasLyrics: true, type: input.type });
}));

router.delete("/:id/lyrics", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const result = await prisma.music.updateMany({ where: { id: req.params.id as string }, data: { lyrics: null, lyricsSynced: false } });
  if (!result.count) return res.status(404).json({ error: "Song not found" });
  res.status(204).end();
}));

router.delete("/:id", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  await prisma.$transaction(async tx => {
    const memberships = await tx.albumSong.findMany({ where: { musicId: song.id }, select: { albumId: true } });
    await Promise.all(memberships.map(item => tx.album.update({ where: { id: item.albumId }, data: { cachedTrackCount: { decrement: 1 }, cachedDuration: { decrement: song.duration ?? 0 } } })));
    await tx.music.delete({ where: { id: song.id } });
    await tx.logEvent.create({ data: { type: "MUSIC_UPLOAD", userId: req.auth!.userId, actionType: "music.deleted", details: { musicId: song.id, title: song.title, fileRetained: true, retainedFile: storedMusicName(song.filePath) } } });
  });
  // Keep the original MP3 on disk for recovery; DB cascades remove playlist/favorite links.
  res.status(204).end();
}));

router.post("/:id/cut", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const { startSeconds, endSeconds } = z.object({ startSeconds: z.number().min(0).max(86_400), endSeconds: z.number().positive().max(86_400) }).strict().refine(value => value.endSeconds - value.startSeconds >= 1, { message: "Keep at least one second of audio" }).parse(req.body);
  const song = await prisma.music.findUnique({ where: { id: req.params.id as string } });
  if (!song) return res.status(404).json({ error: "Song not found" });
  if (song.duration && endSeconds > song.duration + 1) return res.status(400).json({ error: "Cut end is after the song duration" });
  const cut = await cutMusic(song.filePath, startSeconds, endSeconds);
  try {
    const updated = await prisma.$transaction(async tx => {
      const durationDelta = cut.duration - (song.duration ?? 0);
      if (durationDelta) {
        const memberships = await tx.albumSong.findMany({ where: { musicId: song.id }, select: { albumId: true } });
        await Promise.all(memberships.map(item => tx.album.update({ where: { id: item.albumId }, data: { cachedDuration: { increment: durationDelta } } })));
      }
      return tx.music.update({ where: { id: song.id }, data: { filePath: cut.reference, duration: cut.duration } });
    });
    await deleteMusic(song.filePath).catch(() => undefined);
    await audit("MUSIC_UPLOAD", req.auth!.userId, "music.cut", { musicId: song.id, startSeconds, endSeconds, duration: cut.duration });
    res.json(songView(updated));
  } catch (error) { await deleteMusic(cut.reference).catch(() => undefined); throw error; }
}));

router.post("/upload/upload-url", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = directUploadRequest.parse(req.body);
  res.json(await beginDirectUpload("music", req.auth!.userId, input.mimeType, input.size));
}));

router.post("/upload/complete", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({
    uploadToken: z.string().min(1).max(5000),
    title: z.string().trim().min(1).max(150),
    artist: z.string().trim().max(150).optional(),
    artworkUrl: z.string().url().optional(),
    releaseDate: releaseDateInput.optional(),
    confirmDuplicate: z.boolean().default(false)
  }).strict().parse(req.body ?? {});
  const uploaded = await completeDirectUpload("music", req.auth!.userId, input.uploadToken);
  const duplicate = await normalizedDuplicate(input.title, input.artist);
  if (duplicate && !input.confirmDuplicate) {
    await deleteMusic(uploaded.reference).catch(() => undefined);
    return res.status(409).json({ error: "A song with this title and artist already exists", duplicate, confirmationRequired: true });
  }
  let song;
  try {
    song = await prisma.$transaction(async tx => {
      const identity = musicIdentity(input.title, input.artist);
      if (!input.confirmDuplicate) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.normalizedTitle + "\u0000" + identity.normalizedArtist}))`;
        if (await tx.music.findFirst({ where: identity, select: { id: true } })) throw Object.assign(new Error("A song with this title and artist already exists"), { status: 409 });
      }
      const created = await tx.music.create({ data: { title: input.title, artist: input.artist, ...identity, artworkUrl: input.artworkUrl, releaseDate: releaseDateValue(input.releaseDate), filePath: uploaded.reference, mimeType: uploaded.mimeType, duration: uploaded.duration, uploaderId: req.auth!.userId } });
      await addSongToStaffPlaylist(created.id, tx);
      return created;
    });
  } catch (error) {
    await deleteMusic(uploaded.reference).catch(() => undefined);
    throw error;
  }
  await audit("MUSIC_UPLOAD", req.auth!.userId, "music.uploaded", { musicId: song.id, title: song.title, artist: song.artist });
  res.status(201).json(song);
}));

router.post("/upload", requireRank(Rank.Moderator, Rank.Admin, Rank.Developer), upload.single("file"), asyncRoute(async (req, res) => {
  const meta = z.object({ title: z.string().trim().min(1).max(150), artist: z.string().trim().max(150).optional(), artworkUrl: z.string().url().optional(), releaseDate: releaseDateInput.optional(), confirmDuplicate: z.enum(["true", "false"]).optional().transform(value => value === "true") }).parse(req.body ?? {});
  const duplicate = await normalizedDuplicate(meta.title, meta.artist);
  if (duplicate && !meta.confirmDuplicate) return res.status(409).json({ error: "A song with this title and artist already exists", duplicate, confirmationRequired: true });
  if (!req.file) return res.status(400).json({ error: "MP3 file is required" });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (detected?.mime !== "audio/mpeg") return res.status(415).json({ error: "Only valid MP3 files are accepted" });
  const filePath = await saveMusic(req.file.buffer);
  let song;
  try {
    song = await prisma.$transaction(async tx => {
      const identity = musicIdentity(meta.title, meta.artist);
      if (!meta.confirmDuplicate) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.normalizedTitle + "\u0000" + identity.normalizedArtist}))`;
        if (await tx.music.findFirst({ where: identity, select: { id: true } })) throw Object.assign(new Error("A song with this title and artist already exists"), { status: 409 });
      }
      const created = await tx.music.create({ data: { title: meta.title, artist: meta.artist, ...identity, artworkUrl: meta.artworkUrl, releaseDate: releaseDateValue(meta.releaseDate), filePath, duration: mp3DurationSeconds(req.file!.buffer), uploaderId: req.auth!.userId } });
      await addSongToStaffPlaylist(created.id, tx);
      return created;
    });
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
  const play = await prisma.musicPlay.create({ data: { userId: req.auth!.userId, musicId, lastHeartbeatAt: new Date() }, select: { id: true } });
  res.status(201).json(play);
}));

router.patch("/:id/play/:playId", asyncRoute(async (req, res) => {
  const seconds = z.object({ seconds: z.number().int().min(1).max(600) }).strict().parse(req.body).seconds;
  const userId = req.auth!.userId, playId = req.params.playId as string, musicId = req.params.id as string;
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ["reward.interval_seconds", "reward.coin_amount"] } } });
  const setting = new Map(settings.map(item => [item.key, Number(item.value)]));
  const interval = Math.max(60, Math.min(86_400, setting.get("reward.interval_seconds") || 180));
  const coinAmount = Math.max(1, Math.min(10_000, setting.get("reward.coin_amount") || 1));
  const reward = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MusicPlay" WHERE id = ${playId} FOR UPDATE`;
    const play = await tx.musicPlay.findFirst({ where: { id: playId, musicId, userId } });
    if (!play) return null;
    const latest = await tx.musicPlay.findFirst({ where: { userId }, orderBy: [{ playedAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (latest?.id !== play.id) return null;
    const now = new Date();
    const elapsed = Math.max(0, Math.floor((now.getTime() - (play.lastHeartbeatAt ?? play.playedAt).getTime()) / 1000));
    const credited = Math.min(seconds, Math.max(0, elapsed + 2), 600);
    await tx.musicPlay.update({ where: { id: play.id }, data: { listenedSeconds: { increment: credited }, lastHeartbeatAt: now } });
    if (!credited) return { granted: 0, coins: null };
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { rewardSeconds: true, coins: true } });
    const accumulated = user.rewardSeconds + credited;
    const grants = Math.floor(accumulated / interval);
    const granted = grants * coinAmount;
    const updated = await tx.user.update({ where: { id: userId }, data: { rewardSeconds: accumulated % interval, ...(granted ? { coins: { increment: granted } } : {}) }, select: { coins: true } });
    if (granted) await tx.coinTransaction.create({ data: { userId, amount: granted, reason: "listening.reward" } });
    return { granted, coins: updated.coins };
  });
  if (!reward) return res.status(404).json({ error: "Listening session not found" });
  if (reward.granted && reward.coins !== null) {
    notifyUser(userId, "coinsChanged", { coins: reward.coins, granted: reward.granted });
  }
  res.status(204).end();
}));

router.patch("/:id/duration", asyncRoute(async (req, res) => {
  const { duration } = z.object({ duration: z.number().int().min(1).max(24 * 60 * 60) }).strict().parse(req.body);
  const musicId = req.params.id as string;
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.music.updateMany({ where: { id: musicId, duration: null }, data: { duration } });
    if (!result.count) return false;
    const memberships = await tx.albumSong.findMany({ where: { musicId }, select: { albumId: true } });
    await Promise.all(memberships.map(item => tx.album.update({ where: { id: item.albumId }, data: { cachedDuration: { increment: duration } } })));
    return true;
  });
  res.status(changed ? 204 : 200).end();
}));

router.delete("/:id/like", asyncRoute(async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.auth!.userId, musicId: req.params.id as string } });
  res.status(204).end();
}));

export default router;
