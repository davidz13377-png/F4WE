ALTER TABLE "User"
ADD COLUMN "shareListening" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Music"
ADD COLUMN "lyrics" TEXT,
ADD COLUMN "lyricsSynced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MusicPlay"
ADD COLUMN "listenedSeconds" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "FriendRequest" (
  "id" TEXT NOT NULL,
  "senderId" CHAR(16) NOT NULL,
  "receiverId" CHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Friendship" (
  "userId" CHAR(16) NOT NULL,
  "friendId" CHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("userId", "friendId")
);

CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key" ON "FriendRequest"("senderId", "receiverId");
CREATE INDEX "FriendRequest_receiverId_createdAt_idx" ON "FriendRequest"("receiverId", "createdAt");
CREATE INDEX "Friendship_friendId_idx" ON "Friendship"("friendId");

ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey"
FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey"
FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
