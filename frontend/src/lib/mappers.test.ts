import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZES, KIDS_SHOE_SIZES, SHOE_SIZES, sizesFor, sortSizes } from './mappers';
import type { Category } from '../types/product';

const categories: Category[] = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '3', name: 'Детское', slug: 'kids', hasSizes: true },
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

  it('gives kids shoes the 26-35 grid, kids bags none and kids clothes the clothing grid', () => {
    expect(sizesFor(3, categories, 'Ботинки')).toEqual(KIDS_SHOE_SIZES);
    expect(sizesFor(3, categories, 'Кроссовки')).toEqual(KIDS_SHOE_SIZES);
    expect(KIDS_SHOE_SIZES[0]).toBe('26');
    expect(KIDS_SHOE_SIZES.at(-1)).toBe('35');
    expect(sizesFor(3, categories, 'Сумки')).toEqual([]);
    expect(sizesFor(3, categories, 'Куртки')).toEqual(CLOTHING_SIZES);
  });

  it('sorts kids shoe sizes numerically, before adult shoe sizes', () => {
    expect(sortSizes(['36', '30', 'M', '26'])).toEqual(['M', '26', '30', '36']);
  });
});
