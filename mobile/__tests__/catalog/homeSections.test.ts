import { categoryCover, homeSections, resolveInternalPath } from '../../src/lib/catalog/homeSections';
import type { Category, Product } from '../../src/lib/types';

const p = (id: string, extra: Partial<Product> = {}): Product =>
  ({ id, categoryId: '1', price: 1000, stock: 5, images: [`img-${id}`], isBestseller: false, createdAt: '2026-01-01T00:00:00Z', sizes: [], ...extra }) as Product;

describe('homeSections', () => {
  const all = [
    p('1', { isBestseller: true, createdAt: '2026-03-01T00:00:00Z' }),
    p('2', { discountPrice: 900, createdAt: '2026-05-01T00:00:00Z' }),
    p('3', { discountPrice: 500, isBestseller: true, createdAt: '2026-04-01T00:00:00Z' }),
    p('4', { isBestseller: true, stock: 0, discountPrice: 100 }),
  ];

  it('hits are bestsellers, newest by date, discounted by biggest discount first', () => {
    const s = homeSections(all);
    expect(s.hits.map((x) => x.id)).toEqual(['1', '3']);
    expect(s.newest.map((x) => x.id)).toEqual(['2', '3', '1']);
    expect(s.discounted.map((x) => x.id)).toEqual(['3', '2']);
  });

  it('never advertises sold-out products, and caps each section', () => {
    expect(homeSections(all).hits.map((x) => x.id)).not.toContain('4');
    expect(homeSections(all, 1).newest).toHaveLength(1);
  });
});

describe('categoryCover', () => {
  it("prefers the category's bestseller photo, falls back to any, and is undefined for an empty category", () => {
    const list = [p('1', { categoryId: '1' }), p('2', { categoryId: '1', isBestseller: true }), p('3', { categoryId: '2' })];
    expect(categoryCover(list, '1')).toBe('img-2');
    expect(categoryCover(list, '2')).toBe('img-3');
    expect(categoryCover(list, '9')).toBeUndefined();
  });
});

describe('resolveInternalPath', () => {
  const categories: Category[] = [{ id: '3', name: 'Женское', slug: 'women', hasSizes: true }];
  it('opens a category by slug, the whole catalogue, discounts and a product', () => {
    expect(resolveInternalPath('/catalog/women', categories)).toEqual({ screen: 'Catalog', categoryId: 3, discount: undefined });
    expect(resolveInternalPath('/catalog', categories)).toEqual({ screen: 'Catalog', discount: undefined });
    expect(resolveInternalPath('/catalog?discount=true', categories)).toEqual({ screen: 'Catalog', discount: true });
    expect(resolveInternalPath('/product/42', categories)).toEqual({ screen: 'Product', productId: 42 });
  });
  it('ignores unknown paths and categories', () => {
    expect(resolveInternalPath('/catalog/nope', categories)).toBeNull();
    expect(resolveInternalPath('/admin/orders', categories)).toBeNull();
    expect(resolveInternalPath('/product/abc', categories)).toBeNull();
  });
});

import { formatReviewDate, relatedProducts } from '../../src/lib/catalog/homeSections';

describe('relatedProducts', () => {
  it('same category only, never the product itself, same type first, capped', () => {
    const base = p('1', { categoryId: '1', productType: 'Кроссовки' });
    const list = [
      base,
      p('2', { categoryId: '1', productType: 'Худи' }),
      p('3', { categoryId: '1', productType: 'Кроссовки' }),
      p('4', { categoryId: '2', productType: 'Кроссовки' }),
    ];
    expect(relatedProducts(list, base).map((x) => x.id)).toEqual(['3', '2']);
    expect(relatedProducts(list, base, 1)).toHaveLength(1);
  });
});

describe('formatReviewDate', () => {
  it('formats an ISO date and tolerates garbage', () => {
    expect(formatReviewDate('2026-03-07T10:00:00Z')).toBe('07.03.2026');
    expect(formatReviewDate('soon')).toBe('');
  });
});
