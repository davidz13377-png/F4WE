-- Fast playlist summaries, canonical duplicate detection, collaborative playlists and push devices.
ALTER TABLE "Album"
  ADD COLUMN "cachedTrackCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cachedDuration" INTEGER NOT NULL DEFAULT 0;

UPDATE "Album" a SET
  "cachedTrackCount" = summary.track_count,
  "cachedDuration" = summary.total_duration
FROM (
  SELECT als."albumId", COUNT(*)::INTEGER AS track_count,
         COALESCE(SUM(COALESCE(m."duration", 0)), 0)::INTEGER AS total_duration
  FROM "AlbumSong" als
  JOIN "Music" m ON m.id = als."musicId"
  GROUP BY als."albumId"
) summary
WHERE a.id = summary."albumId";

ALTER TABLE "Music"
  ADD COLUMN "releaseDate" TIMESTAMP(3),
  ADD COLUMN "normalizedTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "normalizedArtist" TEXT NOT NULL DEFAULT '';

UPDATE "Music" SET
  "normalizedTitle" = LOWER(REGEXP_REPLACE(TRIM("title"), '[^[:alnum:]]+', '', 'g')),
  "normalizedArtist" = LOWER(REGEXP_REPLACE(TRIM(COALESCE("artist", '')), '[^[:alnum:]]+', '', 'g'));

CREATE INDEX "Music_normalizedTitle_normalizedArtist_idx" ON "Music"("normalizedTitle", "normalizedArtist");

CREATE TABLE "PlaylistCollaborator" (
  "albumId" TEXT NOT NULL,
  "userId" CHAR(16) NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaylistCollaborator_pkey" PRIMARY KEY ("albumId", "userId")
);
CREATE INDEX "PlaylistCollaborator_userId_addedAt_idx" ON "PlaylistCollaborator"("userId", "addedAt");
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushToken" (
  "token" TEXT NOT NULL,
  "userId" CHAR(16) NOT NULL,
  "platform" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushToken_pkey" PRIMARY KEY ("token")
);
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SystemSetting" ("key", "value", "updatedAt") VALUES
  ('app.minimum_version', '1.0.0', CURRENT_TIMESTAMP),
  ('app.update_message', 'A new F4WE update is available. Please update the application to continue.', CURRENT_TIMESTAMP),
  ('app.maintenance_enabled', 'false', CURRENT_TIMESTAMP),
  ('app.maintenance_message', 'F4WE is currently under maintenance. This should not take long. Please try again soon.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
