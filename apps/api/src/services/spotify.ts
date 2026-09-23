const spotifyTrackId = /^[A-Za-z0-9]{22}$/;

export function canonicalSpotifyTrackUrl(value: URL) {
  if (value.protocol !== "https:" || value.hostname !== "open.spotify.com") return null;
  const parts = value.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "track" || !spotifyTrackId.test(parts[1] ?? "")) return null;
  return `https://open.spotify.com/track/${parts[1]}`;
}

export async function spotifyTrackMetadata(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { Accept: "application/json" }, signal: controller.signal
    });
    if (!response.ok) return null;
    const value = await response.json() as { title?: unknown; thumbnail_url?: unknown };
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 150) : "";
    const artworkUrl = typeof value.thumbnail_url === "string" ? value.thumbnail_url : null;
    return title ? { title, artworkUrl } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
