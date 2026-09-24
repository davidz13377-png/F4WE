export function compactDuration(seconds?: number | null) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return `${total} sec`;
  const minutes = Math.floor(total / 60), rest = total % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
  const hours = Math.floor(minutes / 60), mins = minutes % 60;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export function fullDuration(seconds?: number | null) {
  let total = Math.max(0, Math.round(seconds || 0));
  const days = Math.floor(total / 86400); total %= 86400;
  const hours = Math.floor(total / 3600); total %= 3600;
  const minutes = Math.floor(total / 60), secs = total % 60;
  return [days ? `${days} day${days === 1 ? "" : "s"}` : "", hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", minutes ? `${minutes} min` : "", `${secs} sec`].filter(Boolean).join(" ");
}
