import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { QUICK_PICK_LIMIT, discountPercentOf, isNewProduct, maxDiscountPercent, pickProducts } from './productFlags';

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
