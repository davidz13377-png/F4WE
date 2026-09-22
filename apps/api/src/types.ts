import type { Rank } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; rank: Rank; isOwner: boolean };
    }
  }
}

export {};
