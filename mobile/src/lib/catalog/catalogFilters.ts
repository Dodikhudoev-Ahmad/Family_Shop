import type { ProductQuery } from '../api/endpoints';
import type { ProductSortBy } from '../api/types';
import type { Product } from '../types';
import { availableSizeGroups } from './sizeGroups';

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

/** Everything the filter sheet edits. `categoryId` is the one source of truth for the category. */
export interface CatalogFilters extends DependentFilters {
  categoryId: string | null;
  discountOnly: boolean;
}

export function initialFilters(products: Product[], categoryId: string | null, discountOnly = false): CatalogFilters {
  return { categoryId, discountOnly, ...resetDependentFilters(priceBoundsFor(products, categoryId)) };
}

/** Pure transitions: the dependent filters are reset in the same step as the category, never in an effect. */
export function selectCategory(filters: CatalogFilters, categoryId: string | null, products: Product[]): CatalogFilters {
  if (filters.categoryId === categoryId) return filters;
  return { ...filters, categoryId, ...resetDependentFilters(priceBoundsFor(products, categoryId)) };
}

/** A size picked earlier may not exist for the newly chosen type (M, then "Кроссовки") - it is dropped
 * in the same step instead of silently filtering everything out. */
export function selectProductType(filters: CatalogFilters, productType: string | null, products: Product[]): CatalogFilters {
  const groups = availableSizeGroups(products, filters.categoryId, productType);
  const size = filters.size && groups.some((g) => g.sizes.includes(filters.size as string)) ? filters.size : null;
  return { ...filters, productType, size };
}

export function selectSize(filters: CatalogFilters, size: string | null): CatalogFilters {
  return { ...filters, size: filters.size === size ? null : size };
}

export function clampPriceRange(range: PriceRange, bounds: PriceRange): PriceRange {
  const clamp = (v: number) => Math.min(bounds[1], Math.max(bounds[0], Number.isFinite(v) ? v : bounds[0]));
  const lo = clamp(range[0]);
  const hi = clamp(range[1]);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

export function setPriceRange(filters: CatalogFilters, range: PriceRange, bounds: PriceRange): CatalogFilters {
  return { ...filters, priceRange: clampPriceRange(range, bounds) };
}

/** Number of filters that differ from "nothing chosen" (for the badge on the Filters button). The category is not
 * counted: it is already on screen as the title, the underlined strip item and the breadcrumb. */
export function activeFilterCount(filters: CatalogFilters, bounds: PriceRange): number {
  return (
    (filters.productType ? 1 : 0) +
    (filters.size ? 1 : 0) +
    (filters.priceRange[0] > bounds[0] || filters.priceRange[1] < bounds[1] ? 1 : 0) +
    (filters.discountOnly ? 1 : 0)
  );
}

/** Every order the API supports. Only price sorting is offered in the UI (`SORT_OPTIONS`); 'new' / 'popular' are still
 * accepted from outside (the "See all" links on the home screen, old deep links) and applied. */
export type SortOption = 'new' | 'popular' | 'price-asc' | 'price-desc';
export const SORT_OPTIONS = ['price-asc', 'price-desc'] as const satisfies readonly SortOption[];

/** The sort field shows a choice only when it is one of the offered ones; any other order (or none) shows the placeholder. */
export function isOfferedSort(sort: SortOption | null): sort is 'price-asc' | 'price-desc' {
  return sort !== null && (SORT_OPTIONS as readonly SortOption[]).includes(sort);
}

const SORT_TO_API: Record<SortOption, ProductSortBy> = { new: 0, 'price-asc': 1, 'price-desc': 2, popular: 3 };

export const CATALOG_PAGE_SIZE = 12;

/** The server-side part of the filters. Size and "only discounted" have no API equivalent (sizes are
 * derived on the client), so they refine the loaded pages instead - see `refineLoaded`. A price edge is
 * sent only when it actually narrows the window: a [0, 0] placeholder must never reach the server. */
export function buildProductQuery(
  filters: CatalogFilters,
  bounds: PriceRange,
  sort: SortOption | null,
  search: string | null,
  page: number,
  pageSize = CATALOG_PAGE_SIZE
): ProductQuery {
  const [min, max] = filters.priceRange;
  return {
    categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
    productType: filters.productType ?? undefined,
    minPrice: min > bounds[0] ? min : undefined,
    maxPrice: max < bounds[1] ? max : undefined,
    search: search?.trim() ? search.trim() : undefined,
    // No sort chosen: the parameter is left out and the server's default order (newest first) applies.
    sortBy: sort ? SORT_TO_API[sort] : undefined,
    page,
    pageSize,
  };
}

/** Client-side refinement of already-fetched pages. */
export function refineLoaded(products: Product[], filters: Pick<CatalogFilters, 'size' | 'discountOnly'>): Product[] {
  return products.filter((p) => {
    if (filters.size && !p.sizes.includes(filters.size)) return false;
    if (filters.discountOnly && p.discountPrice === undefined) return false;
    return true;
  });
}

/** Exact number of products matching the filters, from the whole loaded catalogue (for "Показать N"). */
export function countMatching(all: Product[], filters: CatalogFilters): number {
  const [min, max] = filters.priceRange;
  return refineLoaded(
    all.filter((p) => {
      if (filters.categoryId && p.categoryId !== filters.categoryId) return false;
      if (filters.productType && p.productType !== filters.productType) return false;
      const price = p.discountPrice ?? p.price;
      return price >= min && price <= max;
    }),
    filters
  ).length;
}

/** How many refined items we want on screen before waiting for the user to scroll. When the client-side
 * filters hide most of a page, the list would be too short to scroll (so `onEndReached` never fires) -
 * keep fetching until it is full or the server has nothing more. */
export const MIN_VISIBLE_BEFORE_IDLE = 6;

export function shouldAutoLoadMore(state: { visibleCount: number; hasMore: boolean; loading: boolean; failed: boolean }): boolean {
  return state.hasMore && !state.loading && !state.failed && state.visibleCount < MIN_VISIBLE_BEFORE_IDLE;
}

/** The empty message is only honest once the server has nothing more to give and nothing is in flight. */
export function shouldShowEmpty(state: { visibleCount: number; hasMore: boolean; loading: boolean; failed: boolean }): boolean {
  return state.visibleCount === 0 && !state.hasMore && !state.loading && !state.failed;
}
