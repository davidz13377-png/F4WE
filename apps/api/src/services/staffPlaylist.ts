import { Prisma, Rank } from "@prisma/client";
import { prisma } from "../db.js";

type Db = Prisma.TransactionClient | typeof prisma;

export function isStaff(rank: Rank, isOwner: boolean) {
  return isOwner || rank === Rank.Moderator || rank === Rank.Admin || rank === Rank.Developer;
}

export async function ensureStaffPlaylist(db: Db = prisma) {
  const existing = await db.album.findFirst({ where: { isStaffPlaylist: true } });
  if (existing) return existing;
  const creator = await db.user.findFirst({
    where: { OR: [{ isOwner: true }, { rank: Rank.Developer }, { rank: Rank.Admin }, { rank: Rank.Moderator }] },
    orderBy: [{ isOwner: "desc" }, { registrationDate: "asc" }], select: { id: true }
  });
  if (!creator) return null;
  try {
    return await db.album.create({ data: {
      name: "Staff Playlist", description: "Every song in F4WE. Visible to staff only.", creatorId: creator.id,
      isPublic: false, isStaffPlaylist: true
    } });
  } catch {
    return db.album.findFirst({ where: { isStaffPlaylist: true } });
  }
}

export async function addSongToStaffPlaylist(musicId: string, db: Db = prisma) {
  const playlist = await ensureStaffPlaylist(db);
  if (!playlist) return;
  const exists = await db.albumSong.findUnique({ where: { albumId_musicId: { albumId: playlist.id, musicId } } });
  if (exists) return;
  const last = await db.albumSong.findFirst({ where: { albumId: playlist.id }, orderBy: { order: "desc" }, select: { order: true } });
  await db.albumSong.create({ data: { albumId: playlist.id, musicId, order: (last?.order ?? -1) + 1 } });
}

export async function backfillStaffPlaylist() {
  const playlist = await ensureStaffPlaylist();
  if (!playlist) return;
  const songs = await prisma.music.findMany({ where: { albums: { none: { albumId: playlist.id } } }, select: { id: true }, orderBy: { uploadDate: "asc" } });
  if (!songs.length) return;
  const last = await prisma.albumSong.findFirst({ where: { albumId: playlist.id }, orderBy: { order: "desc" }, select: { order: true } });
  await prisma.albumSong.createMany({ data: songs.map((song, index) => ({ albumId: playlist.id, musicId: song.id, order: (last?.order ?? -1) + index + 1 })), skipDuplicates: true });
}
