import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProductsPage, type ProductQuery } from '../lib/api/endpoints';
import { mapProduct } from '../lib/mappers';
import type { Category, Product } from '../lib/types';

export interface CatalogPagesState {
  items: Product[];
  page: number;
  hasMore: boolean;
  /** True from the moment a page is requested until it lands - the first page and every later one. */
  loading: boolean;
  /** Set when the last request failed; cleared by `retry` or a new query. */
  failed: boolean;
}

const INITIAL: CatalogPagesState = { items: [], page: 0, hasMore: false, loading: true, failed: false };

/**
 * Server-side paging for the catalogue. A new `queryKey` throws everything away and starts from page 1;
 * a response that belongs to an older key is ignored, and a page is never requested twice at once
 * (the guard is a ref - state alone is too slow when `onEndReached` fires twice in a row).
 */
export function useCatalogPages(queryKey: string, buildQuery: (page: number) => ProductQuery, categories: Category[]) {
  const [state, setState] = useState<CatalogPagesState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const build = useRef(buildQuery);
  build.current = buildQuery;
  const cats = useRef(categories);
  cats.current = categories;
  const seq = useRef(0);
  const inFlight = useRef(false);

  const run = useCallback(async (page: number, mine: number) => {
    inFlight.current = true;
    setState((prev) => ({ ...prev, loading: true, failed: false }));
    try {
      const result = await fetchProductsPage(build.current(page));
      if (mine !== seq.current) return;
      const mapped = result.items.map((dto) => mapProduct(dto, cats.current));
      setState((prev) => {
        const seen = new Set(page === 1 ? [] : prev.items.map((p) => p.id));
        return { items: page === 1 ? mapped : [...prev.items, ...mapped.filter((p) => !seen.has(p.id))], page, hasMore: result.hasMore, loading: false, failed: false };
      });
    } catch {
      if (mine === seq.current) setState((prev) => ({ ...prev, loading: false, failed: true }));
    } finally {
      if (mine === seq.current) inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    seq.current += 1;
    setState(INITIAL);
    void run(1, seq.current);
    return () => {
      seq.current += 1; // anything still in flight is stale now
      inFlight.current = false;
    };
  }, [queryKey, run]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (inFlight.current || !s.hasMore || s.failed || s.page === 0) return;
    void run(s.page + 1, seq.current);
  }, [run]);

  const retry = useCallback(() => {
    if (inFlight.current) return;
    void run(stateRef.current.page + 1, seq.current);
  }, [run]);

  /** Pull-to-refresh: start again from page 1 for the same query. */
  const reload = useCallback(() => {
    seq.current += 1;
    inFlight.current = false;
    setState(INITIAL);
    void run(1, seq.current);
  }, [run]);

  return { ...state, loadMore, retry, reload };
}
