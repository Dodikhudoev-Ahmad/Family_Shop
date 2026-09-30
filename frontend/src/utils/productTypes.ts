import type { Product } from '../types/product';

// A type with too few products in a category isn't worth its own quick-filter chip - it still
// shows up under "Все" and in search, just not as a dedicated chip/checkbox.
export const MIN_TYPE_ITEMS = 5;

/** Product types present in a category (clothes, shoes and bags alike), most common first. */
export function availableProductTypes(products: Product[], categoryId: string | null | undefined): string[] {
  if (!categoryId) return [];
  const counts = new Map<string, number>();
  for (const p of products) {
    if (p.categoryId === categoryId && p.productType) {
      counts.set(p.productType, (counts.get(p.productType) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_TYPE_ITEMS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([t]) => t);
}
