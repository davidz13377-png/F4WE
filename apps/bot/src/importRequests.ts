import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileTypeFromFile } from "file-type";
import type { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

const maxBytes = 25 * 1024 * 1024;
const uploadDir = path.resolve(env.API_UPLOAD_DIR);
const useR2 = env.STORAGE_DRIVER === "r2";
const s3 = useR2 ? new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT!,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
}) : null;
const projectRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const toolsDir = path.join(projectRoot, "tools");
let running = false;

type ToolPaths = { ytDlp: string; ffmpeg: string };
let toolPathsPromise: Promise<ToolPaths> | undefined;
let cookiesPathPromise: Promise<string | undefined> | undefined;

async function findLocalTool(configured: string, executable: "yt-dlp" | "ffmpeg") {
  if (configured !== executable) return configured;
  const fileName = process.platform === "win32" ? `${executable}.exe` : executable;
  const directCandidates = [
    path.join(toolsDir, fileName),
    path.join(toolsDir, executable, fileName),
    path.join(toolsDir, executable, "bin", fileName)
  ];
  for (const candidate of directCandidates) {
    if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  // FFmpeg ZIP archives normally extract into a versioned folder. Search only
  // inside the project's tools directory so startup cannot walk unrelated data.
  const pending: Array<{ directory: string; depth: number }> = [{ directory: toolsDir, depth: 0 }];
  while (pending.length) {
    const current = pending.shift()!;
    const entries = await fs.readdir(current.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const candidate = path.join(current.directory, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return candidate;
      if (entry.isDirectory() && current.depth < 3) pending.push({ directory: candidate, depth: current.depth + 1 });
    }
  }
  return configured;
}

function resolveTools() {
  toolPathsPromise ??= Promise.all([
    findLocalTool(env.YT_DLP_BIN, "yt-dlp"),
    findLocalTool(env.FFMPEG_BIN, "ffmpeg")
  ]).then(([ytDlp, ffmpeg]) => ({ ytDlp, ffmpeg }));
  return toolPathsPromise;
}

async function resolveCookiesPath() {
  if (env.YT_DLP_COOKIES_PATH) {
    await fs.access(env.YT_DLP_COOKIES_PATH);
    return env.YT_DLP_COOKIES_PATH;
  }
  if (!env.YT_DLP_COOKIES_BASE64) return undefined;
  let secret = env.YT_DLP_COOKIES_BASE64.trim();
  if (secret.startsWith("YT_DLP_COOKIES_BASE64=")) secret = secret.slice("YT_DLP_COOKIES_BASE64=".length).trim();
  if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) {
    secret = secret.slice(1, -1).trim();
  }
  let text: string;
  if (/^# (?:HTTP|Netscape HTTP) Cookie File/im.test(secret)) {
    text = secret.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  } else {
    let decoded = Buffer.from(secret.replace(/\s+/g, ""), "base64").toString("utf8");
    // Also tolerate a value that was accidentally encoded twice before it was
    // pasted into Railway.
    if (!/(?:^|\n)# (?:HTTP|Netscape HTTP) Cookie File/i.test(decoded) && /^[A-Za-z0-9+/=\s]+$/.test(decoded.trim())) {
      decoded = Buffer.from(decoded.replace(/\s+/g, ""), "base64").toString("utf8");
    }
    text = decoded;
  }
  text = text.replace(/^\uFEFF/, "");
  const headerIndex = text.search(/(?:^|\n)# (?:HTTP|Netscape HTTP) Cookie File/i);
  if (headerIndex >= 0) text = text.slice(headerIndex).replace(/^\n/, "");
  if (!text.trim()) throw new Error("YT_DLP_COOKIES_BASE64 decoded to an empty file");
  // yt-dlp performs the authoritative Netscape parsing. Prefixing the standard
  // header here avoids rejecting otherwise valid Railway secret formatting.
  if (!/^# (?:HTTP|Netscape HTTP) Cookie File/i.test(text)) {
    text = `# Netscape HTTP Cookie File\n${text}`;
  }
  const cookiePath = path.join(os.tmpdir(), `f4we-youtube-cookies-${process.pid}.txt`);
  await fs.writeFile(cookiePath, text, { mode: 0o600 });
  return cookiePath;
}

function cookiesPath() {
  cookiesPathPromise ??= resolveCookiesPath();
  return cookiesPathPromise;
}

type DownloadAttempt = { client: string; includeCookies: boolean };

function isYouTubeBotCheck(detail: string) {
  return /sign in to confirm you(?:'|’)?re not a bot|confirm you(?:'|’)?re not a bot|login required/i.test(detail);
}

function safeDetail(detail: string) {
  let safe = detail;
  if (env.YT_DLP_PROXY) safe = safe.replaceAll(env.YT_DLP_PROXY, "[configured proxy]");
  return safe.slice(-700);
}

async function runYtDlp(binary: string, args: string[]) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

async function download(url: string, output: string) {
  const tools = await resolveTools();
  const cookieFile = await cookiesPath();
  const attempts: DownloadAttempt[] = [
    { client: "mweb", includeCookies: !!cookieFile },
    { client: "web_safari", includeCookies: !!cookieFile },
    { client: "android_vr", includeCookies: false }
  ];
  let lastDetail = "Download failed";

  for (const attempt of attempts) {
    await fs.rm(output.replace("%(ext)s", "mp3"), { force: true }).catch(() => undefined);
    const args = ["--no-playlist", "--no-progress", "--ignore-config", "--no-warnings",
      "--js-runtimes", `node:${process.execPath}`,
      "--retries", "3", "--fragment-retries", "3", "--extractor-retries", "3",
      "--sleep-requests", "1", "--sleep-interval", "2", "--max-sleep-interval", "5",
      "--extractor-args", `youtube:player_client=${attempt.client}`,
      "--match-filter", "duration <= 1200 & !is_live", "--max-filesize", "25M",
      "-f", "ba[protocol=https]/ba[protocol=http]/ba/b",
      "-x", "--audio-format", "mp3", "--audio-quality", "5", "-o", output, url];
    if (env.YT_DLP_POT_PROVIDER_HOME) {
      args.unshift("--extractor-args", `youtubepot-bgutilscript:server_home=${env.YT_DLP_POT_PROVIDER_HOME}`);
    }
    if (attempt.includeCookies && cookieFile) args.unshift("--cookies", cookieFile);
    if (env.YT_DLP_PROXY) args.unshift("--proxy", env.YT_DLP_PROXY);
    if (path.isAbsolute(tools.ffmpeg) || tools.ffmpeg.includes("/") || tools.ffmpeg.includes("\\")) {
      args.unshift("--ffmpeg-location", path.dirname(path.resolve(tools.ffmpeg)));
    }

    let result: { code: number | null; stderr: string };
    try {
      result = await runYtDlp(tools.ytDlp, args);
    } catch (error) {
      const processError = error as NodeJS.ErrnoException;
      if (processError.code === "ENOENT") {
        throw new Error(`yt-dlp executable not found (${tools.ytDlp}). Put it in ${toolsDir} or set YT_DLP_BIN to its full path.`);
      }
      throw error;
    }
    if (result.code === 0) return;
    lastDetail = safeDetail(result.stderr);
    if (/ffmpeg.*not found|ffprobe.*not found/i.test(lastDetail)) {
      throw new Error(`FFmpeg executable not found. Put it in ${toolsDir} or set FFMPEG_BIN to its full path.`);
    }
    if (/no supported javascript runtime|challenge solving failed/i.test(lastDetail)) {
      throw new Error(`YouTube JavaScript challenge solving failed. Update yt-dlp and verify Node.js 22+ is available (${process.execPath}).`);
    }
    // Trying another official YouTube client only helps extractor/bot-check errors.
    // Format, copyright, private-video and geo errors should be returned unchanged.
    if (!isYouTubeBotCheck(lastDetail) && !/HTTP Error 403|requested format is not available/i.test(lastDetail)) {
      throw new Error(`yt-dlp exited with ${result.code}: ${lastDetail}`);
    }
  }

  if (isYouTubeBotCheck(lastDetail)) {
    throw new Error("YouTube blocked the Railway download session after PO-token/client retries. Configure the optional YT_DLP_PROXY and YT_DLP_COOKIES_BASE64 secrets, then redeploy the bot.");
  }
  throw new Error(`yt-dlp could not download this video after protected-client retries: ${lastDetail}`);
}

async function persistImportedMusic(candidate: string) {
  const filename = `${randomUUID()}.mp3`;
  if (useR2) {
    const key = `music/${filename}`;
    const body = await fs.readFile(candidate);
    await s3!.send(new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: body, ContentType: "audio/mpeg" }));
    return `r2://${key}`;
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const finalPath = path.join(uploadDir, filename);
  await fs.rename(candidate, finalPath);
  return finalPath;
}

async function removePersistedMusic(reference: string) {
  if (reference.startsWith("r2://") && useR2) {
    await s3!.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: reference.slice(5) }));
  } else if (!reference.startsWith("r2://")) {
    await fs.unlink(reference).catch(() => undefined);
  }
}

export async function importQueuedRequests(prisma: PrismaClient) {
  if (running) return;
  running = true;
  try {
    const stale = new Date(Date.now() - 15 * 60_000);
    const rows = await prisma.musicRequest.findMany({ where: { status: "Processing", sourceUrl: { not: null },
      OR: [{ importStartedAt: null }, { importStartedAt: { lt: stale } }] }, orderBy: { requestDate: "asc" }, take: 3 });
    for (const row of rows) {
      const claimed = await prisma.musicRequest.updateMany({ where: { id: row.id, status: "Processing", importStartedAt: row.importStartedAt }, data: { importStartedAt: new Date() } });
      if (!claimed.count) continue;
      let tempDir: string | undefined, storedReference: string | undefined;
      try {
        const source = new URL(row.sourceUrl!);
        if (source.origin !== "https://www.youtube.com" || source.pathname !== "/watch" || !/^[A-Za-z0-9_-]{11}$/.test(source.searchParams.get("v") ?? "")) throw new Error("Invalid YouTube video URL");
        if (!row.requestedTitle?.trim() || !row.requestedArtist?.trim()) throw new Error("Missing song title or artist");
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "f4we-request-"));
        await download(row.sourceUrl!, path.join(tempDir, "audio.%(ext)s"));
        const candidate = path.join(tempDir, "audio.mp3");
        const stat = await fs.stat(candidate);
        if (!stat.size || stat.size > maxBytes || (await fileTypeFromFile(candidate))?.mime !== "audio/mpeg") throw new Error("The download is not a valid MP3 under 25 MB");
        storedReference = await persistImportedMusic(candidate);
        const title = row.requestedTitle.trim(), artist = row.requestedArtist.trim();
        await prisma.$transaction(async tx => {
          const song = await tx.music.create({ data: { title, artist, filePath: storedReference! } });
          await tx.musicRequest.update({ where: { id: row.id }, data: { status: "Accepted", importedMusicId: song.id, processedDate: new Date() } });
          await tx.notification.create({ data: { userId: row.userId, title: "Music request imported", body: `${title} — ${artist} is now in F4WE.` } });
          await tx.logEvent.create({ data: { type: "MUSIC_UPLOAD", userId: row.userId, actionType: "music_request.imported", details: { requestId: row.id, musicId: song.id, title, artist } } });
        });
        storedReference = undefined;
      } catch (error) {
        console.error("Music request import failed", row.id, error);
        const reason = error instanceof Error ? error.message.slice(0, 500) : "Download failed";
        await prisma.$transaction([
          prisma.musicRequest.update({ where: { id: row.id }, data: { status: "Rejected", rejectionReason: reason, processedDate: new Date() } }),
          prisma.notification.create({ data: { userId: row.userId, title: "Music request failed", body: "The YouTube import failed. Ask staff to review the link." } }),
          prisma.logEvent.create({ data: { type: "DEBUG", userId: row.userId, actionType: "music_request.import_failed", details: { requestId: row.id, error: reason } } })
        ]).catch(e => console.error("Could not record failed import", e));
      } finally {
        if (storedReference) await removePersistedMusic(storedReference).catch(() => undefined);
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  } finally { running = false; }
}
