import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Product } from '../types/product';
import { fetchProducts } from '../lib/api';
import { mapProduct } from '../lib/mappers';
import { useCategories } from './CategoriesContext';

interface ProductsContextValue {
  products: Product[];
  isLoading: boolean;
  error: string | null;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { categories, isLoading: categoriesLoading } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (categoriesLoading) return;

    let cancelled = false;
    const shoesBagsId = categories.find((c) => c.slug === 'shoes-bags')?.id;
    const shoesBagsNumericId = shoesBagsId ? Number(shoesBagsId) : null;

    fetchProducts()
      .then((dtos) => {
        if (cancelled) return;
        setProducts(dtos.map((dto) => mapProduct(dto, shoesBagsNumericId)));
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
  }, [categoriesLoading, categories]);

  return (
    <ProductsContext.Provider value={{ products, isLoading: isLoading || categoriesLoading, error }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
