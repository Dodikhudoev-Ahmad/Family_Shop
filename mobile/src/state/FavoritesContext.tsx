import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseFavoriteIds } from '../lib/favorites';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const FAVORITES_STORAGE_KEY = 'fs.favorites';

interface FavoritesContextValue {
  favoriteIds: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  /** Drops several ids at once (products that were deleted from the shop). */
  removeMany: (ids: string[]) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_STORAGE_KEY)
      .then((raw) => setFavoriteIds(parseFavoriteIds(raw)))
      .catch(() => undefined)
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds)).catch(() => undefined);
  }, [favoriteIds]);

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const removeMany = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setFavoriteIds((prev) => prev.filter((x) => !drop.has(x)));
  }, []);

  const value = useMemo(
    () => ({ favoriteIds, isFavorite: (id: string) => favoriteIds.includes(id), toggleFavorite, removeMany }),
    [favoriteIds, toggleFavorite, removeMany]
  );
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
