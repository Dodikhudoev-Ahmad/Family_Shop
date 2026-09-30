import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZES, SHOE_SIZES, sizesFor } from './mappers';
import type { Category } from '../types/product';

const categories: Category[] = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '2', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
];

describe('sizesFor', () => {
  it('gives clothes the clothing grid', () => {
    expect(sizesFor(1, categories, 'Платья')).toEqual(CLOTHING_SIZES);
    expect(sizesFor(1, categories, null)).toEqual(CLOTHING_SIZES);
  });

  it('keeps the separate shoe-size grid for shoes now living in a gender category', () => {
    expect(sizesFor(1, categories, 'Ботинки')).toEqual(SHOE_SIZES);
    expect(sizesFor(1, categories, 'Кроссовки')).toEqual(SHOE_SIZES);
  });

  it('gives bags no sizes and sizeless categories none at all', () => {
    expect(sizesFor(1, categories, 'Сумки')).toEqual([]);
    expect(sizesFor(2, categories, 'Кроссовки')).toEqual([]);
  });
});
