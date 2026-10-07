import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { COLLAGE_LIMIT, QUICK_PICK_LIMIT, discountPercentOf, isNewProduct, maxDiscountPercent, pickProducts, saleCollage } from './productFlags';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id,
  name: `Товар ${id}`,
  description: '',
  price: 10000,
  stock: 5,
  categoryId: '1',
  gender: 'female',
  images: ['a.jpg'],
  sizes: [],
  createdAt: daysAgo(100),
  averageRating: 0,
  reviewCount: 0,
  ...over,
});

describe('discountPercentOf', () => {
  it('rounds to whole percent', () => {
    expect(discountPercentOf(product('1', { discountPrice: 8000 }))).toBe(20);
    expect(discountPercentOf(product('1', { discountPrice: 6667 }))).toBe(33);
  });

  it('is null without a discount, or when the "discount" is not lower than the price', () => {
    expect(discountPercentOf(product('1'))).toBeNull();
    expect(discountPercentOf(product('1', { discountPrice: 10000 }))).toBeNull();
    expect(discountPercentOf(product('1', { discountPrice: 12000 }))).toBeNull();
  });
});

describe('isNewProduct', () => {
  it('is true for a product added within 30 days and false for an older one', () => {
    expect(isNewProduct({ createdAt: daysAgo(2) }, NOW)).toBe(true);
    expect(isNewProduct({ createdAt: daysAgo(30) }, NOW)).toBe(true);
    expect(isNewProduct({ createdAt: daysAgo(31) }, NOW)).toBe(false);
  });

  it('is false for an unreadable date', () => {
    expect(isNewProduct({ createdAt: 'not a date' }, NOW)).toBe(false);
  });
});

describe('maxDiscountPercent', () => {
  it('is the biggest discount, or null when nothing is discounted', () => {
    expect(maxDiscountPercent([product('1'), product('2')])).toBeNull();
    expect(maxDiscountPercent([product('1', { discountPrice: 9000 }), product('2', { discountPrice: 5000 })])).toBe(50);
  });
});

describe('pickProducts', () => {
  const catalog = [
    product('1', { discountPrice: 7000 }),
    product('2', { isBestseller: true }),
    product('3', { createdAt: daysAgo(3) }),
    product('4', { createdAt: daysAgo(1), isBestseller: true }),
    product('5'),
  ];

  it('sale: only discounted products', () => {
    expect(pickProducts(catalog, 'sale', NOW).map((p) => p.id)).toEqual(['1']);
  });

  it('hits: only bestsellers', () => {
    expect(pickProducts(catalog, 'hits', NOW).map((p) => p.id)).toEqual(['2', '4']);
  });

  it('new: only recent products, newest first', () => {
    expect(pickProducts(catalog, 'new', NOW).map((p) => p.id)).toEqual(['4', '3']);
  });

  it('shows at most QUICK_PICK_LIMIT products', () => {
    const many = Array.from({ length: 20 }, (_, i) => product(String(i), { isBestseller: true }));
    expect(pickProducts(many, 'hits', NOW)).toHaveLength(QUICK_PICK_LIMIT);
  });
});

describe('saleCollage', () => {
  const item = (id: string, price: number, discountPrice?: number, images: string[] = [`${id}.jpg`]) =>
    ({ id, price, discountPrice, images }) as Pick<Product, 'id' | 'price' | 'discountPrice' | 'images'>;

  it('takes at most COLLAGE_LIMIT (3) products', () => {
    expect(COLLAGE_LIMIT).toBe(3);
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, 1000, 500));
    expect(saleCollage(list)).toHaveLength(3);
  });

  it('orders by discount, biggest first, and ties keep the catalog order', () => {
    const list = [item('a', 1000, 800), item('b', 1000, 400), item('c', 1000, 800), item('d', 1000, 600)];
    expect(saleCollage(list).map((p) => p.id)).toEqual(['b', 'd', 'a']);
  });

  it('skips products without a discount and without a photo', () => {
    const list = [item('a', 1000), item('b', 1000, 100, []), item('c', 1000, 100, ['']), item('d', 1000, 900)];
    expect(saleCollage(list).map((p) => p.id)).toEqual(['d']);
  });

  it('starts with the product behind the banner percent (maxDiscountPercent)', () => {
    const list = [item('a', 1000, 800), item('b', 2000, 600), item('c', 1000, 900)];
    const [first] = saleCollage(list);
    expect(discountPercentOf(first)).toBe(maxDiscountPercent(list));
  });

  it('is empty when nothing is discounted and does not mutate the input', () => {
    const list = [item('a', 1000), item('b', 1000, 700)];
    const copy = [...list];
    expect(saleCollage([item('a', 1000)])).toEqual([]);
    saleCollage(list);
    expect(list).toEqual(copy);
  });
});
