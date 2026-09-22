import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Rank } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../db.js";

type Token = { sub: string; rank: Rank };

export function signToken(userId: string, rank: Rank) {
  return jwt.sign({ sub: userId, rank }, env.JWT_SECRET, { expiresIn: "7d", issuer: "music-box-api" });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: "music-box-api" }) as Token;
    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { id: true, rank: true, isOwner: true } });
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    req.auth = { userId: user.id, rank: user.rank, isOwner: user.isOwner };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function requireRank(...allowed: Rank[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || (!req.auth.isOwner && !allowed.includes(req.auth.rank))) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
