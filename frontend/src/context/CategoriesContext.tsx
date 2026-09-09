import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Category } from '../types/product';
import { fetchCategories } from '../lib/api';
import { mapCategory } from '../lib/mappers';

interface CategoriesContextValue {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCategories()
      .then((dtos) => {
        if (cancelled) return;
        setCategories(dtos.map(mapCategory));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CategoriesContext.Provider value={{ categories, isLoading, error }}>{children}</CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider');
  return ctx;
}
