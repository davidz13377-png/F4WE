import type { Attachment } from "discord.js";

export type LyricsType = "plain" | "timed";

export const MAX_LYRICS_BYTES = 100_000;

const timedLine = /^\s*(?:\[[^\]]+\]\s*)*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m;

export function decodeLyricsFile(filename: string, type: LyricsType, bytes: Uint8Array) {
  const expectedExtension = type === "timed" ? ".lrc" : ".txt";
  if (!filename.toLocaleLowerCase("en-US").endsWith(expectedExtension)) {
    throw new Error(`A kiválasztott típushoz ${expectedExtension} fájlt csatolj.`);
  }
  if (!bytes.byteLength) throw new Error("A csatolt fájl üres.");
  if (bytes.byteLength > MAX_LYRICS_BYTES) throw new Error("A dalszövegfájl legfeljebb 100 KB lehet.");

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("A fájl nem érvényes UTF-8 szöveg. Mentsd UTF-8 kódolással, majd próbáld újra.");
  }

  content = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!content) throw new Error("A csatolt fájlban nincs dalszöveg.");
  if (content.includes("\0")) throw new Error("A csatolt fájl nem tiszta szövegfájl.");
  if (type === "timed" && !timedLine.test(content)) {
    throw new Error("Az LRC fájlban nincs időzített, például [01:23.45] formátumú dalszövegsor.");
  }
  return content;
}

export async function downloadLyricsFile(attachment: Attachment, type: LyricsType) {
  if (attachment.size > MAX_LYRICS_BYTES) throw new Error("A dalszövegfájl legfeljebb 100 KB lehet.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(attachment.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`A Discord nem tudta átadni a fájlt (HTTP ${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return decodeLyricsFile(attachment.name, type, bytes);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("A fájl letöltése túllépte a 15 másodperces időkorlátot.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
