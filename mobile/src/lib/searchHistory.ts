/** Recent search queries, kept on the device (they are a convenience, not a secret). */
export const SEARCH_HISTORY_MAX = 8;
export const SEARCH_QUERY_MAX = 100;

const normalise = (query: string) => query.trim().replace(/\s+/g, ' ').slice(0, SEARCH_QUERY_MAX);

export function parseSearchHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed as unknown[]) {
      if (typeof item !== 'string') continue;
      const q = normalise(item);
      const key = q.toLowerCase();
      if (!q || seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
    return out.slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

/** Newest first, no duplicates (case-insensitive: the later spelling wins), at most eight. */
export function addSearchQuery(history: string[], query: string): string[] {
  const q = normalise(query);
  if (!q) return history;
  const key = q.toLowerCase();
  return [q, ...history.filter((h) => h.toLowerCase() !== key)].slice(0, SEARCH_HISTORY_MAX);
}

export function removeSearchQuery(history: string[], query: string): string[] {
  const key = normalise(query).toLowerCase();
  return history.filter((h) => h.toLowerCase() !== key);
}

/** The text actually sent to the API: trimmed and bounded. Empty means "do not search". */
export function searchTerm(input: string): string {
  return normalise(input);
}
