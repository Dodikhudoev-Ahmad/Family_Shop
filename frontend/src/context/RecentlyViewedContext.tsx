import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface RecentlyViewedContextValue {
  recentIds: string[];
  addViewed: (id: string) => void;
}

const RecentlyViewedContext = createContext<RecentlyViewedContextValue | null>(null);
const STORAGE_KEY = 'family-shop:recently-viewed';
const MAX_ITEMS = 12;

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentIds));
    } catch {
      // ignore storage errors (private mode, quota)
    }
  }, [recentIds]);

  const addViewed = (id: string) => {
    setRecentIds((prev) => [id, ...prev.filter((existing) => existing !== id)].slice(0, MAX_ITEMS));
  };

  return (
    <RecentlyViewedContext.Provider value={{ recentIds, addViewed }}>{children}</RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentlyViewedContext);
  if (!ctx) throw new Error('useRecentlyViewed must be used within RecentlyViewedProvider');
  return ctx;
}
