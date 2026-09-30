import { describe, expect, it } from 'vitest';
import { priceBoundsFor, resetDependentFilters } from './catalogFilters';
import type { Product } from '../types/product';

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
