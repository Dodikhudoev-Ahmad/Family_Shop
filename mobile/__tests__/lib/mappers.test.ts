import { CLOTHING_SIZES, discountPercent, formatPrice, KIDS_SHOE_SIZES, productSizes, SHOE_SIZES, sizesFor } from '../../src/lib/mappers';
import type { Category } from '../../src/lib/types';

const categories: Category[] = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '3', name: 'Детское', slug: 'kids', hasSizes: true },
  { id: '7', name: 'Посуда', slug: 'posuda', hasSizes: false },
];

describe('sizes', () => {
  it('clothes get the clothing grid, adult shoes 36-40, kids shoes 26-35, bags and sizeless categories none', () => {
    expect(sizesFor(1, categories, 'Платья')).toEqual(CLOTHING_SIZES);
    expect(sizesFor(1, categories, 'Ботинки')).toEqual(SHOE_SIZES);
    expect(sizesFor(3, categories, 'Кроссовки')).toEqual(KIDS_SHOE_SIZES);
    expect(sizesFor(1, categories, 'Сумки')).toEqual([]);
    expect(sizesFor(7, categories, 'Кружки и чашки')).toEqual([]);
  });
});

describe('price formatting', () => {
  it('groups thousands with non-breaking spaces and appends tenge', () => {
    expect(formatPrice(12900)).toBe('12 900 ₸');
    expect(formatPrice(999)).toBe('999 ₸');
    expect(formatPrice(1250000)).toBe('1 250 000 ₸');
  });

  it('computes the discount percent only for a real discount', () => {
    expect(discountPercent(10000, 8000)).toBe(20);
    expect(discountPercent(10000, undefined)).toBeNull();
    expect(discountPercent(10000, 10000)).toBeNull();
  });
});

describe('productSizes - the sizes a customer can pick', () => {
  const dto = (over: Record<string, unknown>) => ({ categoryId: 1, productType: 'Худи', availableSizes: null, ...over }) as never;

  it('null (every product before sizes became editable) = the whole grid of the type', () => {
    expect(productSizes(dto({}), categories)).toEqual(CLOTHING_SIZES);
    expect(productSizes(dto({ productType: 'Кроссовки' }), categories)).toEqual(SHOE_SIZES);
    expect(productSizes(dto({ categoryId: 3, productType: 'Кроссовки' }), categories)).toEqual(KIDS_SHOE_SIZES);
  });

  it('a selection limits the sizes, in grid order, and ignores anything outside the grid', () => {
    expect(productSizes(dto({ availableSizes: ['XL', 'S', 'XS', '38'] }), categories)).toEqual(['S', 'XL']);
  });

  it('a product without a grid has no sizes whatever the API says', () => {
    expect(productSizes(dto({ categoryId: 7, productType: 'Тарелки', availableSizes: ['M'] }), categories)).toEqual([]);
    expect(productSizes(dto({ productType: 'Сумки', availableSizes: ['M'] }), categories)).toEqual([]);
  });
});
