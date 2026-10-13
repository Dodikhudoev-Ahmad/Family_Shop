import { describe, expect, it } from 'vitest';
import { audienceQuery, availableAudiences, parseAudience } from './shoeAudienceFilter';
import type { Product } from '../types/product';

const shoe = (over: Partial<Product>): Product => ({
  id: '1', name: 'Кроссовки', description: '', price: 1, stock: 1, categoryId: '3', gender: 'kids', images: [], sizes: [],
  createdAt: '', averageRating: 0, reviewCount: 0, productType: 'Кроссовки', ...over,
});

describe('availableAudiences', () => {
  const products = [
    shoe({ id: '1', shoeSegment: 'kids', childGender: 'boy' }),
    shoe({ id: '2', shoeSegment: 'teen', childGender: 'girl' }),
    shoe({ id: '3', shoeSegment: 'kids' }),
    shoe({ id: '4', shoeSegment: 'men', categoryId: '2', gender: 'male' }),
    shoe({ id: '5', shoeSegment: 'kids', childGender: 'girl', productType: 'Ботинки' }),
  ];

  it('lists only the audiences that have products, in a fixed order', () => {
    expect(availableAudiences(products, '3', null)).toEqual(['boys', 'girls', 'teens']);
    expect(availableAudiences(products, '3', 'Кроссовки')).toEqual(['boys', 'teens']);
    expect(availableAudiences(products, '3', 'Ботинки')).toEqual(['girls']);
  });

  it('offers nothing where there are no kids or teen shoes', () => {
    expect(availableAudiences(products, '2', null)).toEqual([]);
    expect(availableAudiences([shoe({ shoeSegment: 'kids' })], '3', null)).toEqual([]);
  });
});

describe('audienceQuery', () => {
  it('maps boys and girls to the kids segment and teens to the teen one', () => {
    expect(audienceQuery('boys')).toEqual({ shoeSegment: 2, childGender: 0 });
    expect(audienceQuery('girls')).toEqual({ shoeSegment: 2, childGender: 1 });
    expect(audienceQuery('teens')).toEqual({ shoeSegment: 3 });
  });
});

describe('parseAudience', () => {
  it('accepts only the known values', () => {
    expect(parseAudience('boys')).toBe('boys');
    expect(parseAudience('men')).toBeNull();
    expect(parseAudience(null)).toBeNull();
  });
});
