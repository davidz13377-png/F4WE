const noise = /\b(?:official music video|official video|official audio|lyric video|lyrics?|official|audio|video|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|clean|explicit)\b/gi;

export function normalizeMusicIdentity(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*[([]\s*(?:feat|ft)\.?\s+[^)\]]+[)\]]/gi, " ")
    .replace(/\s+(?:feat|ft)\.?\s+.*$/gi, " ")
    .replace(noise, " ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 300);
}

export function musicIdentity(title: string, artist?: string | null) {
  return { normalizedTitle: normalizeMusicIdentity(title), normalizedArtist: normalizeMusicIdentity(artist) };
}
