import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAllProducts } from '../lib/api/endpoints';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../lib/types';
import { useCategories } from './CategoriesContext';

interface ProductsContextValue {
  /** The whole catalogue (paged until `hasMore` is false) - the source for home sections, price bounds,
   * type chips, size groups and related products, like ProductsContext on the website. */
  products: Product[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { categories, isLoading: categoriesLoading } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const dtos = await fetchAllProducts();
      if (!isCancelled()) setProducts(dtos.map((dto) => mapProduct(dto, categories)));
    } catch (e: unknown) {
      if (!isCancelled()) setError(e instanceof Error ? e.message : 'error');
    } finally {
      if (!isCancelled()) setIsLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    if (categoriesLoading) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [categoriesLoading, load]);

  const reload = useCallback(() => load(() => false), [load]);
  const value = useMemo(
    () => ({ products, isLoading: isLoading || categoriesLoading, error, reload }),
    [products, isLoading, categoriesLoading, error, reload]
  );
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts(): ProductsContextValue {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
