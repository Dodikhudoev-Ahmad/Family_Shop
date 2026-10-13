import { CLOTHING_SIZES, sortSizes } from '../lib/mappers';
import type { Product } from '../types/product';

export type SizeGroupId = 'clothing' | 'shoes' | 'other';

export interface SizeGroup {
  id: SizeGroupId;
  sizes: string[];
}

const CLOTHING = new Set(CLOTHING_SIZES);
// Shoe sizes are European numbers; which ones exist is the server's call (its grids), not a list kept here.
const isShoeSize = (size: string) => /^\d{2}$/.test(size);

/**
 * Sizes a catalog visitor can filter by, from the products they are currently looking at:
 * the chosen category (or everything) and, when picked, the chosen product type - so
 * "Кроссовки" offers shoe sizes only and "Худи" clothing sizes only. With no type picked the
 * category's sizes are split into labelled groups (clothing / shoes) instead of one mixed row.
 */
export function availableSizeGroups(
  products: Product[],
  categoryId: string | null | undefined,
  productType: string | null | undefined
): SizeGroup[] {
  const sizes = new Set<string>();
  for (const p of products) {
    if (categoryId && p.categoryId !== categoryId) continue;
    if (productType && p.productType !== productType) continue;
    for (const s of p.sizes) sizes.add(s);
  }

  const sorted = sortSizes([...sizes]);
  const clothing = sorted.filter((s) => CLOTHING.has(s));
  const shoes = sorted.filter(isShoeSize);
  const other = sorted.filter((s) => !CLOTHING.has(s) && !isShoeSize(s));

  return [
    { id: 'clothing' as const, sizes: clothing },
    { id: 'shoes' as const, sizes: shoes },
    { id: 'other' as const, sizes: other },
  ].filter((g) => g.sizes.length > 0);
}
