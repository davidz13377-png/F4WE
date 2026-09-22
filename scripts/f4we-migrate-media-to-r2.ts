import "dotenv/config";
import { fileTypeFromFile } from "file-type";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../apps/api/src/db.js";
import { env } from "../apps/api/src/env.js";
import { saveImage, saveMusic } from "../apps/api/src/services/storage.js";

if (env.STORAGE_DRIVER !== "r2") throw new Error("Set STORAGE_DRIVER=r2 before running this migration");

const localRoot = path.resolve(process.env.LOCAL_MEDIA_DIR || "apps/api/uploads");
const apiBase = env.PUBLIC_API_URL.replace(/\/$/, "");
const r2PublicBase = env.R2_PUBLIC_URL?.replace(/\/$/, "");

function legacyImagePath(value: string | null, category: "profile" | "playlist" | "music-artwork") {
  if (!value) return null;
  try {
    if (value.startsWith(`${apiBase}/media/${category}/`) || (r2PublicBase && value.startsWith(`${r2PublicBase}/${category}/`))) return null;
    const url = new URL(value);
    if (!url.pathname.startsWith(`/media/${category}/`)) return null;
    return path.join(localRoot, category, path.basename(url.pathname));
  } catch { return null; }
}

async function uploadLegacyImage(value: string | null, category: "profile" | "playlist" | "music-artwork") {
  const source = legacyImagePath(value, category);
  if (!source) return null;
  const type = await fileTypeFromFile(source);
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime)) throw new Error(`Unsupported image: ${source}`);
  return saveImage(category, await fs.readFile(source), type.ext, type.mime);
}

async function main() {
  const songs = await prisma.music.findMany({ select: { id: true, filePath: true, artworkUrl: true } });
  for (const song of songs) {
    let filePath = song.filePath;
    if (!filePath.startsWith("r2://")) {
      const source = await fs.access(filePath).then(() => filePath).catch(() => path.join(localRoot, path.basename(filePath)));
      filePath = await saveMusic(await fs.readFile(source));
      await prisma.music.update({ where: { id: song.id }, data: { filePath } });
      console.log(`MP3 migrated: ${song.id}`);
    }
    const artworkUrl = await uploadLegacyImage(song.artworkUrl, "music-artwork");
    if (artworkUrl) {
      await prisma.music.update({ where: { id: song.id }, data: { artworkUrl } });
      console.log(`Music artwork migrated: ${song.id}`);
    }
  }

  const users = await prisma.user.findMany({ where: { profilePicture: { not: null } }, select: { id: true, profilePicture: true } });
  for (const user of users) {
    const profilePicture = await uploadLegacyImage(user.profilePicture, "profile");
    if (profilePicture) {
      await prisma.user.update({ where: { id: user.id }, data: { profilePicture } });
      console.log(`Profile picture migrated: ${user.id}`);
    }
  }

  const playlists = await prisma.album.findMany({ where: { artworkUrl: { not: null } }, select: { id: true, artworkUrl: true } });
  for (const playlist of playlists) {
    const artworkUrl = await uploadLegacyImage(playlist.artworkUrl, "playlist");
    if (artworkUrl) {
      await prisma.album.update({ where: { id: playlist.id }, data: { artworkUrl } });
      console.log(`Playlist artwork migrated: ${playlist.id}`);
    }
  }
  console.log("F4WE media migration completed.");
}

main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
