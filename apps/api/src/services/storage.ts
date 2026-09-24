import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { env } from "../env.js";

type ImageCategory = "profile" | "playlist" | "music-artwork";
export type DirectUploadCategory = ImageCategory | "music";

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DIRECT_UPLOAD_TTL_SECONDS = 10 * 60;
const UPLOAD_TOKEN_ISSUER = "music-box-upload";
const UPLOAD_TOKEN_AUDIENCE = "direct-r2";

const useR2 = env.STORAGE_DRIVER === "r2";
const publicBase = env.R2_PUBLIC_URL?.replace(/\/$/, "");
const s3 = useR2 ? new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT!,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
}) : null;

const r2Reference = (key: string) => `r2://${key}`;
const r2Key = (reference: string) => reference.startsWith("r2://") ? reference.slice(5) : null;
export const usingR2Storage = useR2;

type DirectUploadToken = JwtPayload & {
  key: string;
  category: DirectUploadCategory;
  contentType: string;
  maxBytes: number;
};

function requestError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function uploadRules(category: DirectUploadCategory, contentType: string) {
  if (category === "music") {
    if (!["audio/mpeg", "audio/mp3", "audio/x-mpeg", "audio/x-mp3", "audio/mpeg3"].includes(contentType.toLowerCase())) throw requestError(415, "Only valid MP3 files are accepted");
    return { extension: "mp3", contentType: "audio/mpeg", maxBytes: Math.floor(env.MAX_MP3_MB * 1024 * 1024) };
  }
  const normalizedType = contentType.toLowerCase() === "image/jpg" ? "image/jpeg" : contentType.toLowerCase();
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(normalizedType)) throw requestError(415, "Use a JPG, PNG, or WebP image");
  const extensions: Record<(typeof IMAGE_MIME_TYPES)[number], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  return { extension: extensions[normalizedType as (typeof IMAGE_MIME_TYPES)[number]], contentType: normalizedType, maxBytes: IMAGE_MAX_BYTES };
}

function imageUrl(key: string) {
  return publicBase ? `${publicBase}/${key}` : `${env.PUBLIC_API_URL.replace(/\/$/, "")}/media/${key}`;
}

async function responseBytes(body: unknown) {
  if (body && typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Creates a short-lived, user-bound PUT URL so large files bypass Railway and
 * travel straight from the device to R2. The object is not trusted until the
 * matching completion call validates its R2 metadata and magic bytes.
 */
export async function beginDirectUpload(category: DirectUploadCategory, userId: string, contentType: string, declaredSize?: number) {
  if (!useR2 || !s3) throw requestError(503, "Direct uploads require R2 storage");
  const rules = uploadRules(category, contentType);
  if (declaredSize !== undefined && (!Number.isSafeInteger(declaredSize) || declaredSize <= 0)) throw requestError(400, "Invalid file size");
  if (declaredSize !== undefined && declaredSize > rules.maxBytes) throw requestError(413, "The selected file is too large");
  const key = `${category}/${randomUUID()}.${rules.extension}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ContentType: rules.contentType }), {
    expiresIn: DIRECT_UPLOAD_TTL_SECONDS,
    signableHeaders: new Set(["content-type"])
  });
  const uploadToken = jwt.sign({ key, category, contentType: rules.contentType, maxBytes: rules.maxBytes }, env.JWT_SECRET, {
    expiresIn: DIRECT_UPLOAD_TTL_SECONDS,
    issuer: UPLOAD_TOKEN_ISSUER,
    audience: UPLOAD_TOKEN_AUDIENCE,
    subject: userId,
    jwtid: randomUUID()
  });
  return { uploadUrl, uploadToken, contentType: rules.contentType, expiresIn: DIRECT_UPLOAD_TTL_SECONDS };
}

export function completeDirectUpload(category: "music", userId: string, uploadToken: string): Promise<{ key: string; reference: string; mimeType: string; size: number; duration: number | null }>;
export function completeDirectUpload(category: ImageCategory, userId: string, uploadToken: string): Promise<{ key: string; url: string; mimeType: string; size: number }>;
export async function completeDirectUpload(category: DirectUploadCategory, userId: string, uploadToken: string) {
  if (!useR2 || !s3) throw requestError(503, "Direct uploads require R2 storage");
  let token: DirectUploadToken;
  try {
    token = jwt.verify(uploadToken, env.JWT_SECRET, {
      issuer: UPLOAD_TOKEN_ISSUER,
      audience: UPLOAD_TOKEN_AUDIENCE,
      subject: userId
    }) as DirectUploadToken;
  } catch {
    throw requestError(400, "The upload session is invalid or expired. Choose the file again.");
  }
  if (token.category !== category || typeof token.key !== "string" || !token.key.startsWith(`${category}/`) || typeof token.contentType !== "string" || typeof token.maxBytes !== "number") {
    throw requestError(400, "The upload session does not match this file");
  }
  const removeInvalid = async () => s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: token.key })).catch(() => undefined);
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET!, Key: token.key }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) throw requestError(400, "The file did not reach storage. Please try again.");
    throw error;
  }
  const size = head.ContentLength;
  if (!size) { await removeInvalid(); throw requestError(400, "The uploaded file is empty"); }
  if (size > token.maxBytes) { await removeInvalid(); throw requestError(413, "The selected file is too large"); }
  if ((head.ContentType ?? "").toLowerCase() !== token.contentType.toLowerCase()) { await removeInvalid(); throw requestError(415, "The uploaded file type does not match the selection"); }

  const sample = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: token.key, Range: "bytes=0-65535" }));
  if (!sample.Body) { await removeInvalid(); throw requestError(400, "The uploaded file could not be verified"); }
  const detected = await fileTypeFromBuffer(await responseBytes(sample.Body));
  const valid = category === "music" ? detected?.mime === "audio/mpeg" : !!detected && (IMAGE_MIME_TYPES as readonly string[]).includes(detected.mime);
  if (!valid) {
    await removeInvalid();
    throw requestError(415, category === "music" ? "Only valid MP3 files are accepted" : "Use a JPG, PNG, or WebP image");
  }
  if (category === "music") {
    const full = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: token.key }));
    const duration = full.Body ? mp3DurationSeconds(await responseBytes(full.Body)) : null;
    return { key: token.key, reference: r2Reference(token.key), mimeType: detected!.mime, size, duration };
  }
  return { key: token.key, url: imageUrl(token.key), mimeType: detected!.mime, size };
}

export async function saveImage(category: ImageCategory, buffer: Buffer, extension: string, contentType: string) {
  const filename = `${randomUUID()}.${extension}`;
  const key = `${category}/${filename}`;
  if (useR2) {
    await s3!.send(new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: buffer, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return publicBase ? `${publicBase}/${key}` : `${env.PUBLIC_API_URL}/media/${key}`;
  }
  const directory = path.resolve(env.UPLOAD_DIR, category);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer, { flag: "wx" });
  return `${env.PUBLIC_API_URL}/media/${category}/${filename}`;
}

export async function deleteImage(urlValue: string | null, category: ImageCategory) {
  if (!urlValue) return;
  try {
    const url = new URL(urlValue);
    if (useR2) {
      const directBase = publicBase ? new URL(`${publicBase}/`) : null;
      const apiBase = new URL(`${env.PUBLIC_API_URL.replace(/\/$/, "")}/`);
      let key: string | null = null;
      if (directBase && url.origin === directBase.origin && url.pathname.startsWith(`${directBase.pathname}${category}/`)) {
        key = decodeURIComponent(url.pathname.slice(directBase.pathname.length));
      } else if (url.origin === apiBase.origin && url.pathname.startsWith(`/media/${category}/`)) {
        key = decodeURIComponent(url.pathname.slice("/media/".length));
      }
      if (!key) return;
      await s3!.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
      return;
    }
    const localBase = new URL(env.PUBLIC_API_URL);
    if (url.origin !== localBase.origin || !url.pathname.startsWith(`/media/${category}/`)) return;
    await fs.unlink(path.resolve(env.UPLOAD_DIR, category, path.basename(url.pathname))).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  } catch {
    // External and malformed URLs must never trigger object deletion.
  }
}

export async function openImage(category: ImageCategory, filename: string) {
  if (!useR2 || !/^[A-Za-z0-9._-]+$/.test(filename)) return null;
  try {
    const object = await s3!.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: `${category}/${filename}` }));
    if (!object.Body) return null;
    return { body: object.Body as unknown as Readable, contentType: object.ContentType ?? "application/octet-stream", length: object.ContentLength };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function saveMusic(buffer: Buffer) {
  const filename = `${randomUUID()}.mp3`;
  if (useR2) {
    const key = `music/${filename}`;
    await s3!.send(new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: buffer, ContentType: "audio/mpeg" }));
    return r2Reference(key);
  }
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  const filePath = path.resolve(env.UPLOAD_DIR, filename);
  await fs.writeFile(filePath, buffer, { flag: "wx" });
  return filePath;
}

// Reads Layer III frame headers instead of trusting the filename or embedded
// metadata. This works for both constant and variable bitrate MP3 files.
export function mp3DurationSeconds(buffer: Buffer) {
  let offset = 0, frames = 0, seconds = 0;
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    const size = ((buffer.readUInt8(6) & 0x7f) << 21) | ((buffer.readUInt8(7) & 0x7f) << 14) | ((buffer.readUInt8(8) & 0x7f) << 7) | (buffer.readUInt8(9) & 0x7f);
    offset = 10 + size;
  }
  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const baseRates = [44100, 48000, 32000];
  while (offset + 4 <= buffer.length) {
    const header = buffer.readUInt32BE(offset);
    if ((header & 0xffe00000) !== 0xffe00000) { offset++; continue; }
    const versionBits = (header >>> 19) & 3, layerBits = (header >>> 17) & 3, bitrateIndex = (header >>> 12) & 15, rateIndex = (header >>> 10) & 3;
    if (versionBits === 1 || layerBits !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) { offset++; continue; }
    const divisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
    const sampleRate = baseRates[rateIndex]! / divisor;
    const bitrate = (versionBits === 3 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex]! * 1000;
    const padding = (header >>> 9) & 1, frameLength = Math.floor((versionBits === 3 ? 144 : 72) * bitrate / sampleRate) + padding;
    if (frameLength < 24 || offset + frameLength > buffer.length + 2) { offset++; continue; }
    seconds += (versionBits === 3 ? 1152 : 576) / sampleRate; frames++; offset += frameLength;
  }
  return frames >= 2 && seconds > 0 ? Math.max(1, Math.round(seconds)) : null;
}

export async function deleteMusic(reference: string) {
  const key = r2Key(reference);
  if (key && useR2) {
    await s3!.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
    return;
  }
  if (!key) await fs.unlink(reference).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) return { invalid: true as const };
  let start: number;
  let end: number;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true as const };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return { invalid: true as const };
  return { start, end, invalid: false as const };
}

export type MusicSource = {
  size: number;
  start: number;
  end: number;
  partial: boolean;
  body: Readable;
};

export async function openMusic(reference: string, rangeHeader?: string): Promise<MusicSource | null> {
  const key = r2Key(reference);
  if (key) {
    if (!useR2) throw new Error("This song is stored in R2 but STORAGE_DRIVER is not r2");
    const head = await s3!.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
    const size = head.ContentLength;
    if (!size) throw new Error("Stored MP3 is empty");
    const parsed = parseRange(rangeHeader, size);
    if (parsed?.invalid) return null;
    const start = parsed?.start ?? 0, end = parsed?.end ?? size - 1;
    const object = await s3!.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Range: parsed ? `bytes=${start}-${end}` : undefined }));
    if (!object.Body) throw new Error("Stored MP3 has no response body");
    return { size, start, end, partial: !!parsed, body: object.Body as unknown as Readable };
  }
  const stat = await fs.stat(reference);
  const parsed = parseRange(rangeHeader, stat.size);
  if (parsed?.invalid) return null;
  const start = parsed?.start ?? 0, end = parsed?.end ?? stat.size - 1;
  return { size: stat.size, start, end, partial: !!parsed, body: createReadStream(reference, parsed ? { start, end } : undefined) };
}

export function storedMusicName(reference: string) {
  return path.basename(r2Key(reference) ?? reference);
}
