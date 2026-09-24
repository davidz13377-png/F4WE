import { Router } from "express";
import { z } from "zod";
import { Rank } from "@prisma/client";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "../db.js";
import { authenticate, requireRank, signToken } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import { audit } from "../services/logging.js";
import { notifyUser, publishListening } from "../services/realtime.js";
import { beginDirectUpload, completeDirectUpload, deleteImage, saveImage } from "../services/storage.js";
import { canonicalSpotifyTrackUrl, spotifyTrackMetadata } from "../services/spotify.js";
import { songView } from "../services/catalog.js";

const router = Router();
const pictureUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const directUploadRequest = z.object({ mimeType: z.string().min(1).max(100), size: z.number().int().positive().optional() }).strict();
const directUploadCompletion = z.object({ uploadToken: z.string().min(1).max(5000) }).strict();
router.use(authenticate);

router.get("/staff-team", asyncRoute(async (_req, res) => {
  res.json(await prisma.user.findMany({ where: { OR: [{ isOwner: true }, { rank: { in: [Rank.Moderator, Rank.Admin, Rank.Developer] } }] },
    select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true }, orderBy: [{ isOwner: "desc" }, { rank: "desc" }, { username: "asc" }] }));
}));

router.get("/me", asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true, registrationDate: true, shareListening: true } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user, refreshedToken: signToken(user.id, user.rank) });
}));

router.patch("/me/listening-privacy", asyncRoute(async (req, res) => {
  const { shareListening } = z.object({ shareListening: z.boolean() }).strict().parse(req.body);
  const user = await prisma.user.update({ where: { id: req.auth!.userId }, data: { shareListening }, select: { shareListening: true } });
  if (!shareListening) publishListening(req.auth!.userId, null);
  res.json(user);
}));

router.get("/me/listening-stats", asyncRoute(async (req, res) => {
  const result = await prisma.musicPlay.aggregate({ where: { userId: req.auth!.userId }, _sum: { listenedSeconds: true }, _count: { id: true } });
  res.json({ totalSeconds: result._sum.listenedSeconds ?? 0, playCount: result._count.id });
}));

router.get("/me/recap", asyncRoute(async (req, res) => {
  const currentYear = new Date().getUTCFullYear();
  const year = z.coerce.number().int().min(2020).max(currentYear).catch(currentYear).parse(req.query.year ?? currentYear);
  const start = new Date(Date.UTC(year, 0, 1)), end = new Date(Date.UTC(year + 1, 0, 1));
  const summary = await prisma.musicPlay.aggregate({
    where: { userId: req.auth!.userId, playedAt: { gte: start, lt: end } },
    _sum: { listenedSeconds: true }, _count: { id: true }
  });
  const grouped = await prisma.musicPlay.groupBy({
    by: ["musicId"], where: { userId: req.auth!.userId, playedAt: { gte: start, lt: end } },
    _sum: { listenedSeconds: true }, _count: { id: true }, orderBy: [{ _sum: { listenedSeconds: "desc" } }, { _count: { id: "desc" } }], take: 5
  });
  const songs = await prisma.music.findMany({ where: { id: { in: grouped.map(item => item.musicId) } } });
  const byId = new Map(songs.map(song => [song.id, song]));
  res.json({
    year, totalSeconds: summary._sum.listenedSeconds ?? 0, playCount: summary._count.id,
    topSongs: grouped.flatMap(item => {
      const song = byId.get(item.musicId);
      return song ? [{ ...songView(song), listenedSeconds: item._sum.listenedSeconds ?? 0, playCount: item._count.id }] : [];
    })
  });
}));

router.patch("/me", asyncRoute(async (req, res) => {
  const input = z.object({ profilePicture: z.string().url().nullable() }).parse(req.body);
  const user = await prisma.user.update({ where: { id: req.auth!.userId }, data: input, select: { id: true, username: true, rank: true, isOwner: true, profilePicture: true } });
  res.json(user);
}));

router.post("/me/picture/upload-url", asyncRoute(async (req, res) => {
  const input = directUploadRequest.parse(req.body);
  res.json(await beginDirectUpload("profile", req.auth!.userId, input.mimeType, input.size));
}));

router.post("/me/picture/complete", asyncRoute(async (req, res) => {
  const { uploadToken } = directUploadCompletion.parse(req.body);
  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { profilePicture: true } });
  const uploaded = await completeDirectUpload("profile", req.auth!.userId, uploadToken);
  try {
    await prisma.user.update({ where: { id: req.auth!.userId }, data: { profilePicture: uploaded.url } });
  } catch (error) {
    await deleteImage(uploaded.url, "profile");
    throw error;
  }
  await deleteImage(current.profilePicture, "profile");
  res.json({ profilePicture: uploaded.url });
}));

router.post("/me/picture", pictureUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required" });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) return res.status(415).json({ error: "Use a JPG, PNG, or WebP image" });
  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { profilePicture: true } });
  const profilePicture = await saveImage("profile", req.file.buffer, detected.ext, detected.mime);
  try {
    await prisma.user.update({ where: { id: req.auth!.userId }, data: { profilePicture } });
  } catch (error) { await deleteImage(profilePicture, "profile"); throw error; }
  await deleteImage(current.profilePicture, "profile");
  res.json({ profilePicture });
}));

router.get("/requests", asyncRoute(async (req, res) => {
  res.json(await prisma.musicRequest.findMany({ where: { userId: req.auth!.userId }, orderBy: { requestDate: "desc" } }));
}));

router.post("/requests", asyncRoute(async (req, res) => {
  const { sourceUrl } = z.object({ sourceUrl: z.string().url().max(250) }).strict().parse(req.body);
  const url = new URL(sourceUrl);
  const spotifyUrl = canonicalSpotifyTrackUrl(url);
  const isYouTube = url.protocol === "https:" && ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  const videoId = isYouTube ? (url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null) : null;
  const youtubeUrl = videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
  if (!youtubeUrl && !spotifyUrl) return res.status(400).json({ error: "Use one YouTube video or Spotify track URL" });
  const canonicalUrl = spotifyUrl ?? youtubeUrl!;
  const spotify = spotifyUrl ? await spotifyTrackMetadata(spotifyUrl) : null;
  const item = await prisma.musicRequest.create({ data: {
    userId: req.auth!.userId,
    songsRequested: spotify?.title ? `${spotify.title} (Spotify)` : canonicalUrl,
    sourceUrl: canonicalUrl,
    requestedTitle: spotify?.title ?? null
  } });
  await audit("MUSIC_REQUEST", req.auth!.userId, "music_request.submitted", { requestId: item.id, sourceUrl: canonicalUrl, provider: spotifyUrl ? "spotify" : "youtube" });
  res.status(201).json(item);
}));

router.delete("/requests/:id", asyncRoute(async (req, res) => {
  const result = await prisma.musicRequest.deleteMany({ where: { id: req.params.id as string, userId: req.auth!.userId, status: { not: "Processing" } } });
  if (!result.count) return res.status(409).json({ error: "Cannot delete a request during import" });
  res.status(204).end();
}));

router.get("/bugs", asyncRoute(async (req, res) => {
  res.json(await prisma.bugReport.findMany({ where: { userId: req.auth!.userId }, orderBy: { reportDate: "desc" } }));
}));

router.post("/bugs", asyncRoute(async (req, res) => {
  const { description } = z.object({ description: z.string().trim().min(10).max(5000) }).parse(req.body);
  const item = await prisma.bugReport.create({ data: { userId: req.auth!.userId, description } });
  await audit("BUG_REPORT", req.auth!.userId, "bug_report.submitted", { reportId: item.id, description });
  res.status(201).json(item);
}));

router.delete("/bugs/:id", asyncRoute(async (req, res) => {
  await prisma.bugReport.deleteMany({ where: { id: req.params.id as string, userId: req.auth!.userId } });
  res.status(204).end();
}));

router.get("/update-ideas", asyncRoute(async (req, res) => {
  const staff = req.auth!.isOwner || req.auth!.rank === Rank.Admin || req.auth!.rank === Rank.Developer;
  res.json(await prisma.updateIdea.findMany({
    where: staff ? undefined : { userId: req.auth!.userId },
    orderBy: { createdDate: "desc" }, take: 300,
    include: staff ? { user: { select: { id: true, username: true, rank: true, profilePicture: true } } } : undefined
  }));
}));

router.post("/update-ideas", asyncRoute(async (req, res) => {
  const { content } = z.object({ content: z.string().trim().min(5).max(3000) }).strict().parse(req.body);
  const idea = await prisma.updateIdea.create({ data: { userId: req.auth!.userId, content } });
  await audit("DEBUG", req.auth!.userId, "update_idea.submitted", { ideaId: idea.id });
  res.status(201).json(idea);
}));

router.delete("/update-ideas/:id", asyncRoute(async (req, res) => {
  const staff = req.auth!.isOwner || req.auth!.rank === Rank.Admin || req.auth!.rank === Rank.Developer;
  const result = await prisma.updateIdea.deleteMany({ where: { id: req.params.id as string, ...(staff ? {} : { userId: req.auth!.userId }) } });
  if (!result.count) return res.status(404).json({ error: "Update idea not found" });
  res.status(204).end();
}));

router.get("/updates", asyncRoute(async (_req, res) => {
  res.json(await prisma.updatePost.findMany({ orderBy: { postedDate: "desc" }, include: { developer: { select: { id: true, username: true, rank: true } } } }));
}));

router.post("/updates", requireRank(Rank.Developer), asyncRoute(async (req, res) => {
  const { content } = z.object({ content: z.string().trim().min(1).max(5000) }).parse(req.body);
  res.status(201).json(await prisma.updatePost.create({ data: { developerId: req.auth!.userId, content } }));
}));

router.patch("/updates/:id", requireRank(Rank.Developer), asyncRoute(async (req, res) => {
  const { content } = z.object({ content: z.string().trim().min(1).max(5000) }).parse(req.body);
  const result = await prisma.updatePost.updateMany({ where: { id: req.params.id as string, developerId: req.auth!.userId }, data: { content, editedDate: new Date() } });
  if (!result.count) return res.status(404).json({ error: "Post not found" });
  res.json(await prisma.updatePost.findUnique({ where: { id: req.params.id as string } }));
}));

router.delete("/updates/:id", requireRank(Rank.Developer), asyncRoute(async (req, res) => {
  await prisma.updatePost.deleteMany({ where: { id: req.params.id as string, developerId: req.auth!.userId } });
  res.status(204).end();
}));

router.get("/notifications", asyncRoute(async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" }, take: 100 }));
}));

router.post("/notifications/read", asyncRoute(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(100) }).parse(req.body);
  await prisma.notification.updateMany({ where: { userId: req.auth!.userId, id: { in: ids } }, data: { read: true } });
  res.status(204).end();
}));

router.get("/staff/requests", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (_req, res) => {
  res.json(await prisma.musicRequest.findMany({ orderBy: { requestDate: "desc" }, include: { user: { select: { id: true, username: true, rank: true } } } }));
}));

router.patch("/staff/requests/:id", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({ status: z.enum(["Accepted", "Rejected"]), reason: z.string().trim().max(1000).optional() }).refine(v => v.status !== "Rejected" || !!v.reason, { message: "A rejection reason is required" }).parse(req.body);
  const existing = await prisma.musicRequest.findUnique({ where: { id: req.params.id as string } });
  if (!existing) return res.status(404).json({ error: "Music request not found" });
  if (existing.status !== "Pending") return res.status(409).json({ error: "Only pending requests can be reviewed" });
  if (existing.sourceUrl?.includes("youtube.com/") && input.status === "Accepted") return res.status(400).json({ error: "Use the plus button to import a YouTube request" });
  const changed = await prisma.musicRequest.updateMany({ where: { id: existing.id, status: "Pending" }, data: { status: input.status, rejectionReason: input.reason, processedDate: new Date() } });
  if (!changed.count) return res.status(409).json({ error: "Request already being processed" });
  const item = await prisma.musicRequest.findUniqueOrThrow({ where: { id: existing.id } });
  const body = input.status === "Accepted" ? `Your request was accepted: ${item.songsRequested}` : `Your request was rejected: ${input.reason}`;
  const notification = await prisma.notification.create({ data: { userId: item.userId, title: `Music request ${input.status.toLowerCase()}`, body } });
  notifyUser(item.userId, "notification", notification);
  await audit("MUSIC_REQUEST", item.userId, "music_request.reviewed", { requestId: item.id, status: input.status, reason: input.reason, reviewerId: req.auth!.userId });
  res.json(item);
}));

router.post("/staff/requests/:id/import", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const { title, artist } = z.object({ title: z.string().trim().min(1).max(150), artist: z.string().trim().min(1).max(150) }).strict().parse(req.body);
  const id = req.params.id as string;
  const existing = await prisma.musicRequest.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Music request not found" });
  if (!existing.sourceUrl?.startsWith("https://www.youtube.com/watch?v=")) return res.status(400).json({ error: "Spotify audio cannot be copied. Upload an authorized MP3 in Music Uploader, then accept the request." });
  const result = await prisma.musicRequest.updateMany({ where: { id, status: "Pending", sourceUrl: { not: null } },
    data: { requestedTitle: title, requestedArtist: artist, status: "Processing", importStartedAt: null, rejectionReason: null } });
  if (!result.count) return res.status(409).json({ error: "This request is not pending or has no YouTube link" });
  await audit("MUSIC_REQUEST", req.auth!.userId, "music_request.import_queued", { requestId: id, title, artist });
  res.status(202).json({ queued: true });
}));

router.get("/staff/bugs", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (_req, res) => {
  res.json(await prisma.bugReport.findMany({ orderBy: { reportDate: "desc" }, include: { user: { select: { id: true, username: true, rank: true } } } }));
}));

router.patch("/staff/bugs/:id", requireRank(Rank.Admin, Rank.Developer), asyncRoute(async (req, res) => {
  const input = z.object({ status: z.enum(["Fixed", "Rejected"]), reason: z.string().trim().max(1000).optional() }).refine(v => v.status !== "Rejected" || !!v.reason, { message: "A rejection reason is required" }).parse(req.body);
  const item = await prisma.bugReport.update({ where: { id: req.params.id as string }, data: { status: input.status, adminResponse: input.reason, resolvedDate: new Date() } });
  const body = input.status === "Fixed" ? "Your bug report was marked as fixed." : `Your bug report was rejected: ${input.reason}`;
  const notification = await prisma.notification.create({ data: { userId: item.userId, title: `Bug report ${input.status.toLowerCase()}`, body } });
  notifyUser(item.userId, "notification", notification);
  await audit("BUG_REPORT", item.userId, "bug_report.reviewed", { reportId: item.id, status: input.status, reason: input.reason, reviewerId: req.auth!.userId });
  res.json(item);
}));

export default router;
