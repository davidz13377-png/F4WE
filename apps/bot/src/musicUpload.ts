import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Attachment } from "discord.js";
import { fileTypeFromBuffer } from "file-type";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const s3 = env.STORAGE_DRIVER === "r2" ? new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT!, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
}) : null;

const MPEG1_BITRATES: Record<number, readonly number[]> = {
  3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
};
const MPEG2_BITRATES: Record<number, readonly number[]> = {
  3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
};

function mpegFrameLength(buffer: Buffer, offset: number) {
  const first = buffer[offset], second = buffer[offset + 1], third = buffer[offset + 2];
  if (first !== 0xff || second === undefined || third === undefined || (second & 0xe0) !== 0xe0) return null;
  const version = (second >> 3) & 0x03;
  const layer = (second >> 1) & 0x03;
  const bitrateIndex = (third >> 4) & 0x0f;
  const sampleRateIndex = (third >> 2) & 0x03;
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const bitrate = (version === 3 ? MPEG1_BITRATES : MPEG2_BITRATES)[layer]?.[bitrateIndex];
  const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex];
  if (!bitrate || !baseSampleRate) return null;
  const sampleRate = version === 3 ? baseSampleRate : version === 2 ? baseSampleRate / 2 : baseSampleRate / 4;
  const padding = (third >> 1) & 1;
  if (layer === 3) return Math.floor((12 * bitrate * 1000) / sampleRate + padding) * 4;
  const coefficient = layer === 1 && version !== 3 ? 72 : 144;
  return Math.floor((coefficient * bitrate * 1000) / sampleRate) + padding;
}

/** Recognizes valid MP3 frame sequences that file-type may miss after unusual ID3 metadata. */
export function hasMpegAudioFrames(buffer: Buffer) {
  if (buffer.length < 8) return false;
  let start = 0;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3" && buffer.length >= 10) {
    const b6 = buffer[6]!, b7 = buffer[7]!, b8 = buffer[8]!, b9 = buffer[9]!;
    const tagSize = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
    const afterTag = 10 + tagSize + ((buffer[5]! & 0x10) !== 0 ? 10 : 0);
    if (afterTag < buffer.length - 4) start = afterTag;
  }
  const end = Math.min(buffer.length - 4, start + 2 * 1024 * 1024);
  for (let offset = start; offset <= end; offset++) {
    const firstLength = mpegFrameLength(buffer, offset);
    if (!firstLength) continue;
    const nextOffset = offset + firstLength;
    if (nextOffset + 4 <= buffer.length && mpegFrameLength(buffer, nextOffset)) return true;
  }
  return false;
}

async function isValidMp3(buffer: Buffer) {
  const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
  return detected?.mime === "audio/mpeg" || hasMpegAudioFrames(buffer);
}

export async function downloadDiscordMp3(attachment: Attachment) {
  if (!s3) throw new Error("Discord music upload requires STORAGE_DRIVER=r2.");
  const maxBytes = Math.floor(env.MAX_MP3_MB * 1024 * 1024);
  if (attachment.size <= 0 || attachment.size > maxBytes) throw new Error(`Az MP3 legfeljebb ${env.MAX_MP3_MB} MB lehet.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const urls = [...new Set([attachment.url, attachment.proxyURL].filter(Boolean))];
    let lastHttpStatus: number | null = null;
    for (const url of urls) {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) { lastHttpStatus = response.status; continue; }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > maxBytes) throw new Error(`Az MP3 legfeljebb ${env.MAX_MP3_MB} MB lehet.`);
      if (await isValidMp3(buffer)) return buffer;
    }
    if (lastHttpStatus !== null && urls.length === 1) throw new Error(`A Discord nem tudta átadni az MP3-at (HTTP ${lastHttpStatus}).`);
    throw new Error("A csatolmány tartalma nem érvényes MP3. Ellenőrizd, hogy valódi MP3-fájl, ne csak .mp3-ra átnevezett más formátum legyen.");
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
  const existing = await tx.albumSong.findUnique({ where: { albumId_musicId: { albumId: playlist.id, musicId } } });
  if (existing) return;
  const music = await tx.music.findUniqueOrThrow({ where: { id: musicId }, select: { duration: true } });
  await tx.albumSong.create({ data: { albumId: playlist.id, musicId, order: (last?.order ?? -1) + 1 } });
  await tx.album.update({ where: { id: playlist.id }, data: { cachedTrackCount: { increment: 1 }, cachedDuration: { increment: music.duration ?? 0 } } });
}

export async function findDuplicate(prisma: PrismaClient, title: string, artist: string) {
  const identity = musicIdentity(title, artist);
  return prisma.music.findFirst({ where: identity, select: { id: true, title: true, artist: true } });
}

export function musicIdentity(title: string, artist?: string | null) {
  const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*[([]\s*(?:feat|ft)\.?\s+[^)\]]+[)\]]/gi, " ")
    .replace(/\s+(?:feat|ft)\.?\s+.*$/gi, " ")
    .replace(/\b(?:official music video|official video|official audio|lyric video|lyrics?|official|audio|video|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|clean|explicit)\b/gi, " ")
    .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "").slice(0, 300);
  return { normalizedTitle: normalize(title), normalizedArtist: normalize(artist) };
}
