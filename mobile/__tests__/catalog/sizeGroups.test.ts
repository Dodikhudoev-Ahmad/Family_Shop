import { availableSizeGroups } from '../../src/lib/catalog/sizeGroups';
import { CLOTHING_SIZES, KIDS_SHOE_SIZES, SHOE_SIZES } from '../../src/lib/mappers';
import type { Product } from '../../src/lib/types';

const make = (id: number, categoryId: string, productType: string, sizes: string[]): Product =>
  ({ id: String(id), categoryId, productType, sizes }) as Product;

const products = [
  make(1, 'men', 'Худи', CLOTHING_SIZES),
  make(2, 'men', 'Брюки', CLOTHING_SIZES),
  make(3, 'men', 'Кроссовки', SHOE_SIZES),
  make(4, 'men', 'Сумки', []),
  make(5, 'kids', 'Кроссовки', KIDS_SHOE_SIZES),
  make(6, 'kids', 'Куртки', CLOTHING_SIZES),
  make(7, 'sport', 'Кроссовки', []),
];

const flat = (g: ReturnType<typeof availableSizeGroups>) => g.flatMap((x) => x.sizes);

describe('availableSizeGroups', () => {
  it('offers only shoe sizes for shoes in Мужское', () => {
    const groups = availableSizeGroups(products, 'men', 'Кроссовки');
    expect(flat(groups)).toEqual(SHOE_SIZES);
    expect(groups.map((g) => g.id)).toEqual(['shoes']);
  });

  it('offers only clothing sizes for a clothing type', () => {
    expect(flat(availableSizeGroups(products, 'men', 'Худи'))).toEqual(CLOTHING_SIZES);
  });

  it('offers the kids shoe grid for kids shoes, not the adult one', () => {
    expect(flat(availableSizeGroups(products, 'kids', 'Кроссовки'))).toEqual(KIDS_SHOE_SIZES);
  });

  it('groups clothing and shoes separately when no type is picked', () => {
    const groups = availableSizeGroups(products, 'men', null);
    expect(groups.map((g) => g.id)).toEqual(['clothing', 'shoes']);
    expect(groups[0].sizes).toEqual(CLOTHING_SIZES);
    expect(groups[1].sizes).toEqual(SHOE_SIZES);
  });

  it("does not leak another category's sizes", () => {
    expect(flat(availableSizeGroups(products, 'men', null))).not.toContain('30');
    expect(flat(availableSizeGroups(products, 'kids', null))).toEqual([...CLOTHING_SIZES, ...KIDS_SHOE_SIZES]);
  });

  it('has nothing to offer for sizeless types and categories', () => {
    expect(availableSizeGroups(products, 'men', 'Сумки')).toEqual([]);
    expect(availableSizeGroups(products, 'sport', null)).toEqual([]);
  });

  it('covers the whole catalog when no category is chosen', () => {
    expect(availableSizeGroups(products, null, null).map((g) => g.id)).toEqual(['clothing', 'shoes']);
  });
});
