// Android media notifications use a special URI, not an ordinary app screen.
// Preserve other links; only map the known notification target.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path === "/notification.click" || path === "notification.click") return "/notification.click";
  try {
    const url = new URL(path, "musicbox://app");
    if ((url.protocol === "musicbox:" || url.protocol === "trackplayer:") &&
        ((url.hostname === "notification.click" && (url.pathname === "" || url.pathname === "/")) ||
         (url.hostname === "app" && url.pathname === "/notification.click"))) {
      return "/notification.click";
    }
  } catch {
    // Router owns malformed/unrelated links; never throw during native startup.
  }
  return path;
}
