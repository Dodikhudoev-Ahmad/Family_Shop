import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addSearchQuery, parseSearchHistory, removeSearchQuery } from '../lib/searchHistory';

export const SEARCH_HISTORY_KEY = 'fs.searchHistory';

/** Recent queries, saved on the device. A failing storage only means the history is not remembered. */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const latest = useRef<string[]>([]);
  const loaded = useRef(false);

  const persist = useCallback((next: string[]) => {
    latest.current = next;
    setHistory(next);
    AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SEARCH_HISTORY_KEY)
      .then((raw) => {
        // a query added before the read finished must not be lost
        const stored = parseSearchHistory(raw);
        const merged = latest.current.reduceRight((acc, q) => addSearchQuery(acc, q), stored);
        latest.current = merged;
        setHistory(merged);
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  const add = useCallback((query: string) => persist(addSearchQuery(latest.current, query)), [persist]);
  const remove = useCallback((query: string) => persist(removeSearchQuery(latest.current, query)), [persist]);
  const clear = useCallback(() => persist([]), [persist]);

  return { history, add, remove, clear };
}
