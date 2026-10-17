-- Platform-specific maintenance controls and durable Owner announcements.
CREATE TABLE "OwnerAnnouncement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "platforms" TEXT[],
  "createdById" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnerAnnouncementDismissal" (
  "announcementId" TEXT NOT NULL,
  "userId" VARCHAR(32) NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerAnnouncementDismissal_pkey" PRIMARY KEY ("announcementId", "userId")
);

CREATE INDEX "OwnerAnnouncement_createdAt_idx" ON "OwnerAnnouncement"("createdAt");
CREATE INDEX "OwnerAnnouncementDismissal_userId_dismissedAt_idx" ON "OwnerAnnouncementDismissal"("userId", "dismissedAt");

ALTER TABLE "OwnerAnnouncement" ADD CONSTRAINT "OwnerAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerAnnouncementDismissal" ADD CONSTRAINT "OwnerAnnouncementDismissal_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "OwnerAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerAnnouncementDismissal" ADD CONSTRAINT "OwnerAnnouncementDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
