import type { Product } from './types';

/** Largest number shown as-is; anything above renders as "99+" so a badge stays compact (the website's CountBadge rule). */
export const BADGE_MAX = 99;

/** Text for a count badge, or null when there is nothing to show (0 is never shown). */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(Math.floor(count));
}

/** Reads whatever was saved: only unique string ids survive, anything else (a damaged save) is dropped. */
export function parseFavoriteIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set((parsed as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
  } catch {
    return [];
  }
}

export interface FavoritesView {
  /** Favourited products still in the catalogue, in the order they were favourited. Sold-out ones are included. */
  products: Product[];
  /** Saved ids whose product no longer exists (deleted from the shop). */
  missingIds: string[];
}

/** Splits saved ids into what can be shown and what has disappeared from the catalogue. */
export function favoritesView(ids: string[], catalogue: Product[]): FavoritesView {
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const products: Product[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    const product = byId.get(id);
    if (product) products.push(product);
    else missingIds.push(id);
  }
  return { products, missingIds };
}
