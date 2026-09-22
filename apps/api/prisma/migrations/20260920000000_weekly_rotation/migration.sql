-- Per-account listening history used by the weekly Home rotation.
CREATE TABLE "MusicPlay" (
  "id" TEXT NOT NULL,
  "userId" CHAR(16) NOT NULL,
  "musicId" TEXT NOT NULL,
  "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicPlay_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MusicPlay" ADD CONSTRAINT "MusicPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicPlay" ADD CONSTRAINT "MusicPlay_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MusicPlay_userId_playedAt_idx" ON "MusicPlay"("userId", "playedAt");
CREATE INDEX "MusicPlay_musicId_playedAt_idx" ON "MusicPlay"("musicId", "playedAt");
