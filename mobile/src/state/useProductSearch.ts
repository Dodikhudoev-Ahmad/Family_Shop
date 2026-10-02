import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProductsPage } from '../lib/api/endpoints';
import { mapProduct } from '../lib/mappers';
import { searchTerm } from '../lib/searchHistory';
import type { Category, Product } from '../lib/types';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULTS_LIMIT = 20;

/** idle: nothing typed. loading: waiting (debounce or request). done: the answer for the CURRENT text has arrived. */
export type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * Live search against the real API. Typing is debounced; an answer that belongs to an older text is thrown away,
 * and "nothing found" (status `done` with no results) is only ever reported for the text that was actually searched.
 */
export function useProductSearch(input: string, categories: Category[]) {
  const term = searchTerm(input);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<Product[]>([]);
  // The term the current `results`/`status` belong to - guards against showing "nothing found" for a half-typed word.
  const [answeredFor, setAnsweredFor] = useState('');
  const generation = useRef(0);
  const cats = useRef(categories);
  cats.current = categories;
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    if (!term) {
      setStatus('idle');
      setResults([]);
      setAnsweredFor('');
      return;
    }

    setStatus('loading');
    const timer = setTimeout(() => {
      fetchProductsPage({ search: term, pageSize: SEARCH_RESULTS_LIMIT })
        .then((page) => {
          if (mine !== generation.current) return;
          setResults(page.items.map((dto) => mapProduct(dto, cats.current)));
          setAnsweredFor(term);
          setStatus('done');
        })
        .catch(() => {
          if (mine !== generation.current) return;
          setResults([]);
          setAnsweredFor(term);
          setStatus('error');
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, retryTick]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);
  // Even if state lags a render behind the input, never report an answer for a different text.
  const effective: SearchStatus = term && answeredFor !== term && (status === 'done' || status === 'error') ? 'loading' : status;
  return { term, status: effective, results, retry };
}
