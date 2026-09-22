-- Add the upload-only Moderator role.
ALTER TYPE "Rank" ADD VALUE IF NOT EXISTS 'Moderator' AFTER 'Access';

-- Allow named keys and more than one registration per key.
DROP INDEX IF EXISTS "User_accessKeyUsed_key";
DROP INDEX IF EXISTS "AccessKey_usedByUserId_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_accessKeyUsed_fkey";
ALTER TABLE "AccessKey" DROP COLUMN IF EXISTS "usedByUserId";
ALTER TABLE "AccessKey" ALTER COLUMN "key" TYPE VARCHAR(64);
ALTER TABLE "AccessKey" ADD COLUMN "usageLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AccessKey" ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "AccessKey" SET "usedCount" = CASE WHEN "used" THEN 1 ELSE 0 END;
ALTER TABLE "User" ALTER COLUMN "accessKeyUsed" TYPE VARCHAR(64);
ALTER TABLE "User" ADD CONSTRAINT "User_accessKeyUsed_fkey" FOREIGN KEY ("accessKeyUsed") REFERENCES "AccessKey"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessKey" ADD CONSTRAINT "AccessKey_usageLimit_check" CHECK ("usageLimit" BETWEEN 1 AND 100);
ALTER TABLE "AccessKey" ADD CONSTRAINT "AccessKey_usedCount_check" CHECK ("usedCount" BETWEEN 0 AND "usageLimit");

-- Keep uploaded songs when their uploader account is deleted.
ALTER TABLE "Music" DROP CONSTRAINT IF EXISTS "Music_uploaderId_fkey";
ALTER TABLE "Music" ALTER COLUMN "uploaderId" DROP NOT NULL;
ALTER TABLE "Music" ADD CONSTRAINT "Music_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User-submitted update ideas.
CREATE TABLE "UpdateIdea" (
  "id" TEXT NOT NULL,
  "userId" CHAR(16) NOT NULL,
  "content" TEXT NOT NULL,
  "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UpdateIdea_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UpdateIdea" ADD CONSTRAINT "UpdateIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "UpdateIdea_createdDate_idx" ON "UpdateIdea"("createdDate" DESC);
