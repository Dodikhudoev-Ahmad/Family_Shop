import { describe, expect, it } from 'vitest';
import { availableProductTypes, MIN_TYPE_ITEMS } from './productTypes';
import type { Product } from '../types/product';

const make = (id: number, categoryId: string, productType: string): Product =>
  ({ id: String(id), categoryId, productType }) as Product;

const many = (n: number, categoryId: string, type: string, from = 0) =>
  Array.from({ length: n }, (_, i) => make(from + i, categoryId, type));

describe('availableProductTypes', () => {
  it('lists shoe and bag types next to clothing types, most common first', () => {
    const products = [
      ...many(6, 'women', 'Платья'),
      ...many(7, 'women', 'Ботинки', 100),
      ...many(5, 'women', 'Сумки', 200),
    ];
    expect(availableProductTypes(products, 'women')).toEqual(['Ботинки', 'Платья', 'Сумки']);
  });

  it('keeps the MIN_TYPE_ITEMS visibility threshold for shoes too', () => {
    const products = [...many(MIN_TYPE_ITEMS - 1, 'men', 'Кроссовки'), ...many(MIN_TYPE_ITEMS, 'men', 'Рубашки', 100)];
    expect(availableProductTypes(products, 'men')).toEqual(['Рубашки']);
    expect(availableProductTypes([...products, make(999, 'men', 'Кроссовки')], 'men')).toContain('Кроссовки');
  });

  it("only counts the requested category's products", () => {
    const products = [...many(5, 'men', 'Кроссовки'), ...many(5, 'women', 'Платья', 100)];
    expect(availableProductTypes(products, 'men')).toEqual(['Кроссовки']);
    expect(availableProductTypes(products, null)).toEqual([]);
  });
});
