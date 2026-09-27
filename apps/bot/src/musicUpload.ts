import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Attachment } from "discord.js";
import { fileTypeFromBuffer } from "file-type";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const s3 = env.STORAGE_DRIVER === "r2" ? new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT!, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
}) : null;

export async function downloadDiscordMp3(attachment: Attachment) {
  if (!s3) throw new Error("Discord music upload requires STORAGE_DRIVER=r2.");
  const maxBytes = Math.floor(env.MAX_MP3_MB * 1024 * 1024);
  if (attachment.size <= 0 || attachment.size > maxBytes) throw new Error(`Az MP3 legfeljebb ${env.MAX_MP3_MB} MB lehet.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(attachment.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`A Discord nem tudta átadni az MP3-at (HTTP ${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new Error(`Az MP3 legfeljebb ${env.MAX_MP3_MB} MB lehet.`);
    if ((await fileTypeFromBuffer(buffer))?.mime !== "audio/mpeg") throw new Error("A csatolmány tartalma nem érvényes MP3.");
    return buffer;
  } finally { clearTimeout(timeout); }
}

export async function uploadMusicObject(buffer: Buffer) {
  if (!s3) throw new Error("Discord music upload requires STORAGE_DRIVER=r2.");
  const key = `music/${randomUUID()}.mp3`;
  await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: buffer, ContentType: "audio/mpeg" }));
  return { key, reference: `r2://${key}` };
}

export async function removeMusicObject(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key })).catch(() => undefined);
}

export async function addToStaffPlaylist(tx: Prisma.TransactionClient, musicId: string) {
  let playlist = await tx.album.findFirst({ where: { isStaffPlaylist: true } });
  if (!playlist) {
    const creator = await tx.user.findFirst({ where: { OR: [{ isOwner: true }, { rank: "Developer" }, { rank: "Admin" }, { rank: "Moderator" }] }, orderBy: [{ isOwner: "desc" }, { registrationDate: "asc" }] });
    if (creator) playlist = await tx.album.create({ data: { name: "Staff Playlist", description: "Every song in F4WE. Visible to staff only.", creatorId: creator.id, isStaffPlaylist: true } });
  }
  if (!playlist) return;
  const last = await tx.albumSong.findFirst({ where: { albumId: playlist.id }, orderBy: { order: "desc" }, select: { order: true } });
  await tx.albumSong.upsert({ where: { albumId_musicId: { albumId: playlist.id, musicId } }, create: { albumId: playlist.id, musicId, order: (last?.order ?? -1) + 1 }, update: {} });
}

export async function findDuplicate(prisma: PrismaClient, title: string, artist: string) {
  return prisma.music.findFirst({ where: { title: { equals: title, mode: "insensitive" }, artist: artist ? { equals: artist, mode: "insensitive" } : null }, select: { id: true, title: true, artist: true } });
}
