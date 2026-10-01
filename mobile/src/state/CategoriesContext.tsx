import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCategories } from '../lib/api/endpoints';
import { mapCategory } from '../lib/mappers';
import type { Category } from '../lib/types';

interface CategoriesContextValue {
  categories: Category[];
  isLoading: boolean;
  /** Server/network error message, or null. */
  error: string | null;
  reload: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dtos = await fetchCategories();
      setCategories(dtos.map(mapCategory));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ categories, isLoading, error, reload }), [categories, isLoading, error, reload]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoriesContextValue {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider');
  return ctx;
}
