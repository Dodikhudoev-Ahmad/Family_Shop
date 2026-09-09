import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useToast } from './ToastContext';

interface FavoritesContextValue {
  favoriteIds: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string, name: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const STORAGE_KEY = 'family-shop:favorites';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const { showToast } = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch {
      // ignore storage errors (private mode, quota)
    }
  }, [favoriteIds]);

  const isFavorite = (id: string) => favoriteIds.includes(id);

  const toggleFavorite = (id: string, name: string) => {
    setFavoriteIds((prev) => {
      const has = prev.includes(id);
      showToast(has ? `«${name}» удалён из избранного` : `«${name}» добавлен в избранное`, 'info');
      return has ? prev.filter((f) => f !== id) : [...prev, id];
    });
  };

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
