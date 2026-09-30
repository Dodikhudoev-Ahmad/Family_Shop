import type { Product } from '../types/product';

export type PriceRange = [number, number];

/** Filters whose valid values depend on which category is being browsed. */
export interface DependentFilters {
  productType: string | null;
  size: string | null;
  priceRange: PriceRange;
}

/** Price span of a category's products (or of everything when no category is chosen).
 * [0, 0] while nothing is loaded yet. */
export function priceBoundsFor(products: Product[], categoryId: string | null | undefined): PriceRange {
  let min = Infinity;
  let max = -Infinity;
  for (const p of products) {
    if (categoryId && p.categoryId !== categoryId) continue;
    const price = p.discountPrice ?? p.price;
    if (price < min) min = price;
    if (price > max) max = price;
  }
  return min === Infinity ? [0, 0] : [min, max];
}

/**
 * The single rule for what happens to the dependent filters when the category changes: type and
 * size belonged to the previous category, and the price window is back to the full span of the
 * new one. (Independent preferences - sorting, "only discounted" - are not touched.)
 */
export function resetDependentFilters(newCategoryBounds: PriceRange): DependentFilters {
  return { productType: null, size: null, priceRange: newCategoryBounds };
}
