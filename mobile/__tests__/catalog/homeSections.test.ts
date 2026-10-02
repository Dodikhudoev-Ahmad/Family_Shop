import { CATEGORY_COVERS, COVER_FALLBACK_EXCLUDED_TYPES } from '../../src/categoryCovers';
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
  const cat = (id: string, slug: string) => ({ id, slug });
  const item = (id: string, categoryId: string, productType: string, extra: Partial<Product> = {}) => p(id, { categoryId, productType, ...extra });

  it('women / men / kids use the same fixed photos as the website hero tiles, whatever the catalogue holds', () => {
    const list = [item('1', '1', 'Кроссовки', { isBestseller: true })];
    for (const slug of ['women', 'men', 'kids']) {
      const cover = categoryCover(list, cat('1', slug));
      expect(cover).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
    }
    expect(CATEGORY_COVERS.women.image).not.toBe(CATEGORY_COVERS.men.image);
  });

  it('a tech category is shown by an appliance, never by shoes - even when shoes are its bestseller', () => {
    const list = [
      item('1', '4', 'Кроссовки', { isBestseller: true }),
      item('2', '4', 'Тостеры'),
      item('3', '4', 'Холодильники'),
    ];
    // Холодильники is listed before Тостеры in the rule
    expect(categoryCover(list, cat('4', 'bytovaya-tehnika'))).toBe('img-3');
  });

  it('within a type the bestseller goes first, and the rule order decides between types', () => {
    const rules = { sport: { types: ['Гантели', 'Тренажёры'] } };
    const list = [item('1', '5', 'Тренажёры'), item('2', '5', 'Гантели'), item('3', '5', 'Гантели', { isBestseller: true })];
    expect(categoryCover(list, cat('5', 'sport'), rules)).toBe('img-3');
    expect(categoryCover([item('1', '5', 'Тренажёры')], cat('5', 'sport'), rules)).toBe('img-1');
  });

  it('explicit product ids override the types, and an id missing from this catalogue is skipped', () => {
    const rules = { posuda: { productIds: [999, 7], types: ['Чайники'] } };
    const list = [item('7', '6', 'Тарелки'), item('8', '6', 'Чайники')];
    expect(categoryCover(list, cat('6', 'posuda'), rules)).toBe('img-7');
  });

  it('a fixed image wins over everything', () => {
    expect(categoryCover([item('1', '6', 'Чайники')], cat('6', 'posuda'), { posuda: { image: 'https://x.test/a.jpg', types: ['Чайники'] } })).toBe('https://x.test/a.jpg');
  });

  it('with no rule it falls back to any product that is not footwear or a bag, and is undefined for an empty category', () => {
    const list = [item('1', '9', 'Кроссовки'), item('2', '9', 'Сумки'), item('3', '9', 'Чехлы')];
    expect(categoryCover(list, cat('9', 'unknown'), {})).toBe('img-3');
    expect(categoryCover([item('1', '9', 'Кроссовки')], cat('9', 'unknown'), {})).toBeUndefined();
    expect(categoryCover(list, cat('77', 'unknown'), {})).toBeUndefined();
  });

  it('every non-hero category of the shop has a rule that never names footwear or bags', () => {
    for (const [slug, rule] of Object.entries(CATEGORY_COVERS)) {
      if (rule.image) continue;
      expect(rule.types?.length).toBeGreaterThan(0);
      expect((rule.types ?? []).filter((t) => COVER_FALLBACK_EXCLUDED_TYPES.includes(t))).toEqual([]);
      expect(['bytovaya-tehnika', 'sport', 'posuda', 'aksessuary']).toContain(slug);
    }
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
