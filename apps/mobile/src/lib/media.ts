import { API_URL } from "./api";

// Server-owned profile images must use the API host reachable by this device.
// Ordinary external image URLs remain unchanged.
export function profilePictureUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, API_URL);
    if (url.pathname.startsWith("/media/profile/") || url.pathname.startsWith("/media/playlist/")) {
      return API_URL.replace(/\/+$/, "") + url.pathname + url.search;
    }
  } catch { return value; }
  return value;
}
