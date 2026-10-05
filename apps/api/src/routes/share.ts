import { Router } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncRoute } from "../middleware/errors.js";

const router = Router();
const downloadUrl = "https://f4we.xyz/";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeImage(value: string | null) {
  if (!value) return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/share/f4we.png`;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : `${env.PUBLIC_API_URL.replace(/\/$/, "")}/share/f4we.png`;
  } catch {
    return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/share/f4we.png`;
  }
}

router.get("/f4we.png", (_req, res) => {
  const candidates = [path.resolve(process.cwd(), "apps/api/assets/F4WE-icon.png"), path.resolve(process.cwd(), "apps/mobile/assets/F4WE-icon.png")];
  const icon = candidates.find(existsSync);
  if (!icon) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(icon);
});

router.get("/playlist/:id", asyncRoute(async (req, res) => {
  const id = req.params.id as string;
  const playlist = await prisma.album.findFirst({
    where: { id, isPublic: true, isStaffPlaylist: false },
    select: { id: true, name: true, description: true, artworkUrl: true, cachedTrackCount: true, cachedDuration: true, creator: { select: { username: true } } }
  });
  if (!playlist) return res.status(404).type("html").send("<!doctype html><title>Playlist unavailable · F4WE</title><h1>This playlist is private or unavailable.</h1>");
  const apiBase = env.PUBLIC_API_URL.replace(/\/$/, "");
  const canonical = `${apiBase}/share/playlist/${encodeURIComponent(playlist.id)}`;
  const deepLink = `musicbox://playlist/${encodeURIComponent(playlist.id)}`;
  const intent = `intent://playlist/${encodeURIComponent(playlist.id)}#Intent;scheme=musicbox;package=com.musicbox.app;S.browser_fallback_url=${encodeURIComponent(downloadUrl)};end`;
  const durationMinutes = Math.max(1, Math.round(playlist.cachedDuration / 60));
  const description = playlist.description?.trim() || `${playlist.cachedTrackCount} songs · ${durationMinutes} min · Created by ${playlist.creator.username}`;
  const title = `${playlist.name} · F4WE Playlist`;
  const image = safeImage(playlist.artworkUrl);
  const jsonDeepLink = JSON.stringify(deepLink).replace(/</g, "\\u003c");
  const jsonFallback = JSON.stringify(downloadUrl).replace(/</g, "\\u003c");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data:; base-uri 'none'; form-action 'none'");
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:site_name" content="F4WE"><meta property="og:type" content="music.playlist"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(image)}">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fff;font:16px system-ui,sans-serif;padding:24px}.card{width:min(520px,100%);background:#111;border:1px solid #2b2b2b;border-radius:28px;padding:28px;text-align:center;box-shadow:0 24px 80px #000}.cover{width:180px;height:180px;object-fit:cover;border-radius:22px;background:#222}.brand{letter-spacing:.35em;font-weight:900;color:#aaa}.title{font-size:30px;margin:18px 0 8px}.meta{color:#aaa;line-height:1.6}.actions{display:grid;gap:10px;margin-top:24px}a{display:block;text-decoration:none;border-radius:999px;padding:15px 20px;font-weight:900}.open{background:#fff;color:#000}.download{border:1px solid #444;color:#fff}</style></head>
<body><main class="card"><div class="brand">F4WE</div><h1 class="title">${escapeHtml(playlist.name)}</h1><img class="cover" src="${escapeHtml(image)}" alt="Playlist artwork"><p class="meta">${escapeHtml(description)}</p><div class="actions"><a class="open" href="${escapeHtml(intent)}">Open in F4WE</a><a class="download" href="${downloadUrl}">Download F4WE</a></div></main>
<script>const deep=${jsonDeepLink},fallback=${jsonFallback};if(!/Discordbot|WhatsApp|Twitterbot|facebookexternalhit|Slackbot/i.test(navigator.userAgent)){location.href=deep;setTimeout(()=>{if(!document.hidden)location.href=fallback},1400)}</script></body></html>`);
}));

export default router;
