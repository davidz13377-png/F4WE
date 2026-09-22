-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('Access', 'Admin', 'Developer');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('Pending', 'Accepted', 'Rejected', 'Fixed');

-- CreateTable
CREATE TABLE "User" (
    "id" CHAR(16) NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rank" "Rank" NOT NULL DEFAULT 'Access',
    "profilePicture" TEXT,
    "registrationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessKeyUsed" CHAR(16) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessKey" (
    "key" CHAR(16) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedByUserId" CHAR(16),
    "createdByDiscordId" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedDate" TIMESTAMP(3),

    CONSTRAINT "AccessKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Music" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "duration" INTEGER,
    "artworkUrl" TEXT,
    "uploaderId" CHAR(16) NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Music_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "artworkUrl" TEXT,
    "creatorId" CHAR(16) NOT NULL,
    "creationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumSong" (
    "albumId" TEXT NOT NULL,
    "musicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AlbumSong_pkey" PRIMARY KEY ("albumId","musicId")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" CHAR(16) NOT NULL,
    "musicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","musicId")
);

-- CreateTable
CREATE TABLE "SavedAlbum" (
    "userId" CHAR(16) NOT NULL,
    "albumId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAlbum_pkey" PRIMARY KEY ("userId","albumId")
);

-- CreateTable
CREATE TABLE "MusicRequest" (
    "id" TEXT NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "songsRequested" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'Pending',
    "rejectionReason" TEXT,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedDate" TIMESTAMP(3),

    CONSTRAINT "MusicRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'Pending',
    "adminResponse" TEXT,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedDate" TIMESTAMP(3),

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdatePost" (
    "id" TEXT NOT NULL,
    "developerId" CHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedDate" TIMESTAMP(3),

    CONSTRAINT "UpdatePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRanksHistory" (
    "id" TEXT NOT NULL,
    "userId" CHAR(16) NOT NULL,
    "oldRank" "Rank" NOT NULL,
    "newRank" "Rank" NOT NULL,
    "changedBy" CHAR(16),
    "actorLabel" TEXT,
    "changeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRanksHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_accessKeyUsed_key" ON "User"("accessKeyUsed");

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_usedByUserId_key" ON "AccessKey"("usedByUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accessKeyUsed_fkey" FOREIGN KEY ("accessKeyUsed") REFERENCES "AccessKey"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Music" ADD CONSTRAINT "Music_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumSong" ADD CONSTRAINT "AlbumSong_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumSong" ADD CONSTRAINT "AlbumSong_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAlbum" ADD CONSTRAINT "SavedAlbum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAlbum" ADD CONSTRAINT "SavedAlbum_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicRequest" ADD CONSTRAINT "MusicRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdatePost" ADD CONSTRAINT "UpdatePost_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRanksHistory" ADD CONSTRAINT "UserRanksHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRanksHistory" ADD CONSTRAINT "UserRanksHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
