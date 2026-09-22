import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { audit } from "../services/logging.js";

export const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => void fn(req, res, next).catch(next);

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed", fields: error.flatten() });
  if (typeof error === "object" && error && "status" in error && typeof error.status === "number") {
    return res.status(error.status).json({ error: error instanceof Error ? error.message : "Request failed" });
  }
  console.error(error);
  void audit("DEBUG", req.auth?.userId ?? null, "api.unexpected_error", {
    method: req.method, path: req.originalUrl,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined
  }).catch(logError => console.error("Could not queue debug log", logError));
  return res.status(500).json({ error: "Unexpected server error" });
}
