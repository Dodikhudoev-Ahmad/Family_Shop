import { priceBoundsFor, resetDependentFilters } from '../../src/lib/catalog/catalogFilters';
import type { Product } from '../../src/lib/types';

const make = (categoryId: string, price: number, discountPrice?: number): Product =>
  ({ id: `${categoryId}-${price}`, categoryId, price, discountPrice }) as Product;

const products = [make('women', 8000), make('women', 20000, 12000), make('dishes', 900), make('dishes', 4000)];

describe('priceBoundsFor', () => {
  it("spans only the chosen category's effective (discounted) prices", () => {
    expect(priceBoundsFor(products, 'women')).toEqual([8000, 12000]);
    expect(priceBoundsFor(products, 'dishes')).toEqual([900, 4000]);
  });

  it('spans the whole shop without a category, and is [0, 0] with nothing loaded', () => {
    expect(priceBoundsFor(products, null)).toEqual([900, 12000]);
    expect(priceBoundsFor([], 'women')).toEqual([0, 0]);
    expect(priceBoundsFor(products, 'nonexistent')).toEqual([0, 0]);
  });
});

describe('resetDependentFilters', () => {
  it('clears type and size and puts the price window back to the new category bounds', () => {
    expect(resetDependentFilters([900, 4000])).toEqual({ productType: null, size: null, priceRange: [900, 4000] });
  });
});

import {
  activeFilterCount,
  buildProductQuery,
  clampPriceRange,
  countMatching,
  initialFilters,
  refineLoaded,
  selectCategory,
  selectProductType,
  selectSize,
  setPriceRange,
  shouldAutoLoadMore,
  shouldShowEmpty,
} from '../../src/lib/catalog/catalogFilters';

const item = (id: string, categoryId: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, categoryId, price, sizes: [], isBestseller: false, ...extra }) as Product;

const shop = [
  item('1', '1', 8000, { productType: 'Худи', sizes: ['M', 'L'] }),
  item('2', '1', 20000, { productType: 'Кроссовки', sizes: ['39', '40'], discountPrice: 15000 }),
  item('3', '2', 900, { productType: 'Тарелки' }),
  item('4', '2', 4000, { productType: 'Тарелки' }),
];

describe('category change (single source of truth)', () => {
  it('resets type, size and the price window synchronously with the category', () => {
    const start = { ...initialFilters(shop, '1'), productType: 'Худи', size: 'M', priceRange: [9000, 10000] as [number, number], discountOnly: true };
    const next = selectCategory(start, '2', shop);
    expect(next).toEqual({ categoryId: '2', productType: null, size: null, priceRange: [900, 4000], discountOnly: true });
  });

  it('keeps independent preferences, and re-picking the same category changes nothing', () => {
    const start = { ...initialFilters(shop, '1', true), size: 'M' };
    expect(selectCategory(start, '1', shop)).toBe(start);
  });

  it('initial filters span the category (or the shop)', () => {
    expect(initialFilters(shop, null).priceRange).toEqual([900, 15000]);
    expect(initialFilters(shop, '1').priceRange).toEqual([8000, 15000]);
  });
});

describe('type change', () => {
  it('drops a size that does not exist for the new type, keeps one that does', () => {
    const withM = { ...initialFilters(shop, '1'), size: 'M' };
    expect(selectProductType(withM, 'Кроссовки', shop).size).toBeNull();
    expect(selectProductType(withM, 'Худи', shop).size).toBe('M');
    expect(selectProductType(withM, null, shop).size).toBe('M');
  });
});

describe('size, price, counts', () => {
  it('picking the picked size again clears it', () => {
    const f = selectSize(selectSize(initialFilters(shop, '1'), 'M'), 'M');
    expect(f.size).toBeNull();
  });

  it('clamps and orders the price window inside the bounds', () => {
    expect(clampPriceRange([0, 999999], [900, 4000])).toEqual([900, 4000]);
    expect(clampPriceRange([3000, 1000], [900, 4000])).toEqual([1000, 3000]);
    expect(clampPriceRange([Number.NaN, 2000], [900, 4000])).toEqual([900, 2000]);
    expect(setPriceRange(initialFilters(shop, '2'), [1000, 3000], [900, 4000]).priceRange).toEqual([1000, 3000]);
  });

  it('counts active filters, price only when narrower than the bounds', () => {
    const base = initialFilters(shop, null);
    const bounds = base.priceRange;
    expect(activeFilterCount(base, bounds)).toBe(0);
    // the category itself is not counted (it is visible as the page title); size + price + discount are
    expect(activeFilterCount({ ...base, categoryId: '1', size: 'M', discountOnly: true, priceRange: [1000, bounds[1]] }, bounds)).toBe(3);
    expect(activeFilterCount({ ...base, categoryId: '1', productType: 'Худи' }, bounds)).toBe(1);
  });

  it('counts matching products from the whole catalogue, with effective prices', () => {
    expect(countMatching(shop, initialFilters(shop, null))).toBe(4);
    expect(countMatching(shop, { ...initialFilters(shop, null), discountOnly: true })).toBe(1);
    expect(countMatching(shop, { ...initialFilters(shop, '1'), size: '40' })).toBe(1);
    expect(countMatching(shop, { ...initialFilters(shop, null), priceRange: [10000, 16000] })).toBe(1);
  });
});

describe('server query', () => {
  it('never sends a price edge that does not narrow the window, nor [0, 0]', () => {
    const f = initialFilters(shop, '1');
    const q = buildProductQuery(f, [8000, 15000], 'new', null, 1);
    expect(q).toMatchObject({ categoryId: 1, minPrice: undefined, maxPrice: undefined, sortBy: 0, page: 1 });
    expect(buildProductQuery({ ...f, priceRange: [9000, 12000] }, [8000, 15000], 'price-desc', ' ', 2)).toMatchObject({
      categoryId: 1,
      minPrice: 9000,
      maxPrice: 12000,
      sortBy: 2,
      page: 2,
      search: undefined,
    });
  });

  it('passes type and a trimmed search through', () => {
    const q = buildProductQuery({ ...initialFilters(shop, null), productType: 'Худи' }, [900, 15000], 'popular', ' плащ ', 1);
    expect(q).toMatchObject({ productType: 'Худи', search: 'плащ', sortBy: 3 });
  });
});

describe('client-side refinement never hides the truth', () => {
  it('filters by size and discount', () => {
    expect(refineLoaded(shop, { size: 'M', discountOnly: false }).map((p) => p.id)).toEqual(['1']);
    expect(refineLoaded(shop, { size: null, discountOnly: true }).map((p) => p.id)).toEqual(['2']);
  });

  it('keeps loading while the refined list is short and the server has more', () => {
    expect(shouldAutoLoadMore({ visibleCount: 1, hasMore: true, loading: false, failed: false })).toBe(true);
    expect(shouldAutoLoadMore({ visibleCount: 1, hasMore: false, loading: false, failed: false })).toBe(false);
    expect(shouldAutoLoadMore({ visibleCount: 1, hasMore: true, loading: true, failed: false })).toBe(false);
    expect(shouldAutoLoadMore({ visibleCount: 1, hasMore: true, loading: false, failed: true })).toBe(false);
    expect(shouldAutoLoadMore({ visibleCount: 20, hasMore: true, loading: false, failed: false })).toBe(false);
  });

  it('says "nothing found" only when nothing is loading and nothing more can come', () => {
    expect(shouldShowEmpty({ visibleCount: 0, hasMore: true, loading: false, failed: false })).toBe(false);
    expect(shouldShowEmpty({ visibleCount: 0, hasMore: false, loading: true, failed: false })).toBe(false);
    expect(shouldShowEmpty({ visibleCount: 0, hasMore: false, loading: false, failed: true })).toBe(false);
    expect(shouldShowEmpty({ visibleCount: 0, hasMore: false, loading: false, failed: false })).toBe(true);
    expect(shouldShowEmpty({ visibleCount: 3, hasMore: false, loading: false, failed: false })).toBe(false);
  });
});
