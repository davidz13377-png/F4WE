-- Spotify-style artist and release catalog shared by mobile and desktop clients.
CREATE TABLE "CatalogArtist" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "imageUrl" TEXT,
  "heroUrl" TEXT,
  "bio" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" VARCHAR(32),
  CONSTRAINT "CatalogArtist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogRelease" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "description" TEXT,
  "artworkUrl" TEXT,
  "releaseDate" TIMESTAMP(3),
  "type" TEXT NOT NULL DEFAULT 'Album',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" VARCHAR(32),
  CONSTRAINT "CatalogRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogReleaseTrack" (
  "releaseId" TEXT NOT NULL,
  "musicId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CatalogReleaseTrack_pkey" PRIMARY KEY ("releaseId", "musicId")
);

ALTER TABLE "Music" ADD COLUMN "catalogArtistId" TEXT;

CREATE UNIQUE INDEX "CatalogArtist_normalizedName_key" ON "CatalogArtist"("normalizedName");
CREATE INDEX "CatalogArtist_name_idx" ON "CatalogArtist"("name");
CREATE UNIQUE INDEX "CatalogRelease_artistId_normalizedTitle_key" ON "CatalogRelease"("artistId", "normalizedTitle");
CREATE INDEX "CatalogRelease_artistId_releaseDate_idx" ON "CatalogRelease"("artistId", "releaseDate");
CREATE INDEX "CatalogReleaseTrack_musicId_idx" ON "CatalogReleaseTrack"("musicId");
CREATE INDEX "Music_catalogArtistId_idx" ON "Music"("catalogArtistId");

ALTER TABLE "CatalogArtist" ADD CONSTRAINT "CatalogArtist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogRelease" ADD CONSTRAINT "CatalogRelease_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "CatalogArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogRelease" ADD CONSTRAINT "CatalogRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogReleaseTrack" ADD CONSTRAINT "CatalogReleaseTrack_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "CatalogRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogReleaseTrack" ADD CONSTRAINT "CatalogReleaseTrack_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Music" ADD CONSTRAINT "Music_catalogArtistId_fkey" FOREIGN KEY ("catalogArtistId") REFERENCES "CatalogArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
