-- User profile, rewards and shop data.
ALTER TABLE "User"
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rewardSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "animatedProfileUnlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "animatedBannerUnlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "activeProfileDesignId" TEXT;

ALTER TABLE "MusicPlay" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "Album" ADD COLUMN "isStaffPlaylist" BOOLEAN NOT NULL DEFAULT false;

-- Usernames are log-in identifiers and are unique regardless of letter case.
DROP INDEX IF EXISTS "User_username_key";
CREATE UNIQUE INDEX "User_username_key" ON "User" (LOWER("username"));
CREATE UNIQUE INDEX "Album_isStaffPlaylist_key" ON "Album" ("isStaffPlaylist") WHERE "isStaffPlaylist" = true;

CREATE TABLE "ShopProduct" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ProfileDesign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "assetUrl" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "isLimited" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" CHAR(16) NOT NULL,
  CONSTRAINT "ProfileDesign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnedProfileDesign" (
  "userId" CHAR(16) NOT NULL,
  "designId" TEXT NOT NULL,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pricePaid" INTEGER NOT NULL,
  CONSTRAINT "OwnedProfileDesign_pkey" PRIMARY KEY ("userId", "designId")
);

CREATE TABLE "CoinTransaction" (
  "id" TEXT NOT NULL,
  "userId" CHAR(16) NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" CHAR(16),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardInvite" (
  "id" TEXT NOT NULL,
  "buyerId" CHAR(16) NOT NULL,
  "accessKey" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardInvite_accessKey_key" ON "RewardInvite"("accessKey");
CREATE INDEX "RewardInvite_buyerId_createdAt_idx" ON "RewardInvite"("buyerId", "createdAt");
CREATE INDEX "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_activeProfileDesignId_fkey" FOREIGN KEY ("activeProfileDesignId") REFERENCES "ProfileDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileDesign" ADD CONSTRAINT "ProfileDesign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnedProfileDesign" ADD CONSTRAINT "OwnedProfileDesign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnedProfileDesign" ADD CONSTRAINT "OwnedProfileDesign_designId_fkey" FOREIGN KEY ("designId") REFERENCES "ProfileDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardInvite" ADD CONSTRAINT "RewardInvite_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardInvite" ADD CONSTRAINT "RewardInvite_accessKey_fkey" FOREIGN KEY ("accessKey") REFERENCES "AccessKey"("key") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ShopProduct" ("key", "name", "description", "price", "active", "updatedAt") VALUES
  ('invite_code', 'Invite Code', 'One-use reward invite code.', 500, true, CURRENT_TIMESTAMP),
  ('animated_profile', 'Animated profile picture', 'Lifetime GIF profile picture access.', 300, true, CURRENT_TIMESTAMP),
  ('animated_banner', 'Animated banner', 'Lifetime GIF profile banner access.', 350, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "SystemSetting" ("key", "value", "updatedAt") VALUES
  ('reward.interval_seconds', '180', CURRENT_TIMESTAMP),
  ('reward.coin_amount', '1', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
