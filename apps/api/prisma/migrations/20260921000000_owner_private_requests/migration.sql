ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'Processing';
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Album" ALTER COLUMN "isPublic" SET DEFAULT false;
ALTER TABLE "MusicRequest" ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "requestedTitle" TEXT,
  ADD COLUMN "requestedArtist" TEXT,
  ADD COLUMN "importStartedAt" TIMESTAMP(3),
  ADD COLUMN "importedMusicId" TEXT;
CREATE INDEX "MusicRequest_status_importStartedAt_idx" ON "MusicRequest"("status", "importStartedAt");
