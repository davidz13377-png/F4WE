import { prisma } from "../db.js";
import { musicIdentity } from "./musicIdentity.js";

/** Keeps pre-update songs compatible with the canonical duplicate checker. */
export async function backfillMusicIdentities() {
  let cursor: string | undefined;
  for (;;) {
    const songs = await prisma.music.findMany({
      orderBy: { id: "asc" }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, artist: true, normalizedTitle: true, normalizedArtist: true }
    });
    if (!songs.length) return;
    const updates = songs.flatMap(song => {
      const identity = musicIdentity(song.title, song.artist);
      return identity.normalizedTitle === song.normalizedTitle && identity.normalizedArtist === song.normalizedArtist
        ? []
        : [prisma.music.update({ where: { id: song.id }, data: identity })];
    });
    if (updates.length) await prisma.$transaction(updates);
    cursor = songs.at(-1)!.id;
  }
}
