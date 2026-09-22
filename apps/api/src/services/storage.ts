import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { env } from "../env.js";

type ImageCategory = "profile" | "playlist" | "music-artwork";

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
