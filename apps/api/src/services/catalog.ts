import type { Music } from "@prisma/client";
import { env } from "../env.js";

export function songView(song: Music & { favorites?: unknown[] }) {
  const { filePath: _path, mimeType: _mime, lyrics, favorites, ...publicSong } = song;
  return { ...publicSong, hasLyrics: !!lyrics, liked: !!favorites?.length, streamUrl: `${env.PUBLIC_API_URL}/api/music/${song.id}/stream` };
}
