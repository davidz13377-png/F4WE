import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HistoryEntry } from "../types";

export function parseHistory(raw: string | null): HistoryEntry[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is HistoryEntry => !!item && typeof item === "object" && Number.isFinite(item.at) &&
      item.kind === "song" && typeof item.musicId === "string" && item.musicId.length > 0 && item.musicId.length <= 100).slice(0, 10);
  } catch { return []; }
}
export function mergeHistory(previous: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...previous.filter(item => item.musicId !== entry.musicId)].slice(0, 10);
}
// Serialise reads/writes per account: rapid song changes cannot lose history.
const queues = new Map<string, Promise<unknown>>();
export function historyFor(userId: string, entry?: HistoryEntry, removeMusicId?: string): Promise<HistoryEntry[]> {
  const key = `f4we-history-${userId}`;
  const work = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
    const stored = await AsyncStorage.getItem(key);
    let entries = parseHistory(stored);
    if (entry) entries = mergeHistory(entries, entry);
    if (removeMusicId) entries = entries.filter(item => item.musicId !== removeMusicId);
    if (entry || removeMusicId || (stored !== null && stored !== JSON.stringify(entries))) await AsyncStorage.setItem(key, JSON.stringify(entries));
    return entries;
  });
  queues.set(key, work);
  void work.finally(() => { if (queues.get(key) === work) queues.delete(key); }).catch(() => undefined);
  return work;
}
