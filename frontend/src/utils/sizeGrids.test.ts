import { describe, expect, it } from 'vitest';
import ru from '../i18n/locales/ru.json';
import kk from '../i18n/locales/kk.json';
import en from '../i18n/locales/en.json';
import { pickShoeGrid, productTypesFor, shoeGridsForGender, sizeGridFor, summarizeSizes } from './sizeGrids';
import type { ShoeSizeGridDto } from '../types/api';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const shoeGrids: ShoeSizeGridDto[] = [
  { segment: 0, gender: 0, sizes: range(39, 45), childGenders: [] },
  { segment: 1, gender: 1, sizes: range(35, 41), childGenders: [] },
  { segment: 2, gender: 2, sizes: range(27, 37), childGenders: [0, 1] },
  { segment: 3, gender: 2, sizes: range(37, 41), childGenders: [0, 1] },
];

const women = { slug: 'women', hasSizes: true };
const kids = { slug: 'kids', hasSizes: true };
const appliances = { slug: 'bytovaya-tehnika', hasSizes: false };

describe('sizeGridFor', () => {
  it('follows the type, not the category', () => {
    const womenShoes = pickShoeGrid(shoeGrids, 1, null);
    expect(sizeGridFor(women, 'Худи')?.sizes).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(sizeGridFor(women, 'Кроссовки', womenShoes)).toMatchObject({ label: 'Женская обувь', sizes: range(35, 41) });
    expect(sizeGridFor(women, 'Сумки')).toBeNull();
    expect(sizeGridFor(kids, 'Рюкзаки')).toBeNull();
  });

  it('takes a shoe grid from the server segment, and has none without one', () => {
    const teen = pickShoeGrid(shoeGrids, 2, 3);
    expect(sizeGridFor(kids, 'Ботинки', teen)).toMatchObject({ label: 'Подростковая обувь', sizes: range(37, 41) });
    expect(sizeGridFor(kids, 'Ботинки')).toBeNull();
  });

  it('has no grid for categories without sizes or an unknown category', () => {
    expect(sizeGridFor(appliances, 'Холодильники')).toBeNull();
    expect(sizeGridFor(undefined, 'Худи')).toBeNull();
  });
});

describe('shoe segments', () => {
  it('offers one segment to adults and kids or teen to children', () => {
    expect(shoeGridsForGender(shoeGrids, 0).map((g) => g.segment)).toEqual([0]);
    expect(shoeGridsForGender(shoeGrids, 1).map((g) => g.segment)).toEqual([1]);
    expect(shoeGridsForGender(shoeGrids, 2).map((g) => g.segment)).toEqual([2, 3]);
  });

  it('keeps the chosen segment when it fits the gender, else the first that does', () => {
    expect(pickShoeGrid(shoeGrids, 2, 3)?.segment).toBe(3);
    expect(pickShoeGrid(shoeGrids, 2, null)?.segment).toBe(2);
    expect(pickShoeGrid(shoeGrids, 0, 3)?.segment).toBe(0);
    expect(pickShoeGrid([], 0, null)).toBeNull();
  });

  it('shares size 37 between kids and teen', () => {
    expect(pickShoeGrid(shoeGrids, 2, 2)?.sizes).toContain('37');
    expect(pickShoeGrid(shoeGrids, 2, 3)?.sizes).toContain('37');
  });
});

describe('summarizeSizes', () => {
  const clothing = sizeGridFor(women, 'Худи');
  const shoes = sizeGridFor(women, 'Кроссовки', pickShoeGrid(shoeGrids, 1, null));

  it('summarises ranges, scattered sizes, one size and the whole grid', () => {
    expect(summarizeSizes(['S', 'M', 'L', 'XL'], clothing)).toBe('S–XL');
    expect(summarizeSizes(['M', '3XL'], clothing)).toBe('M, 3XL');
    expect(summarizeSizes(['M'], clothing)).toBe('M');
    expect(summarizeSizes(null, clothing)).toBe('S–4XL');
    expect(summarizeSizes(null, shoes)).toBe('35–41');
  });

  it('says "без размеров" for a type without a grid', () => {
    expect(summarizeSizes(null, null)).toBe('без размеров');
  });
});

describe('productTypesFor', () => {
  it('offers clothes, shoes and bags in the gender categories and the category\'s own types elsewhere', () => {
    expect(productTypesFor('men')).toEqual(expect.arrayContaining(['Худи', 'Кроссовки', 'Сумки']));
    expect(productTypesFor('bytovaya-tehnika')).toContain('Холодильники');
    expect(productTypesFor('bytovaya-tehnika')).not.toContain('Худи');
    expect(productTypesFor('bytovaya-tehnika')).toContain('Чайники');
    expect(productTypesFor('posuda')).toContain('Чайники');
    const fallback = productTypesFor('some-new-category');
    expect(fallback.filter((type) => type === 'Чайники')).toHaveLength(1);
    expect(productTypesFor('some-new-category')).toEqual(expect.arrayContaining(['Худи', 'Холодильники']));
  });
});

describe('"Дом и быт" (dom-i-byt)', () => {
  const homeTypes = ['Этажерки', 'Органайзеры', 'Системы хранения', 'Декор'];
  const home = { slug: 'dom-i-byt', hasSizes: false };

  it('offers its own four types and none of the clothing or appliance ones', () => {
    expect(productTypesFor('dom-i-byt')).toEqual(homeTypes);
  });

  it('has no size grid for any of its types', () => {
    for (const type of homeTypes) expect(sizeGridFor(home, type)).toBeNull();
    expect(summarizeSizes(null, sizeGridFor(home, 'Этажерки'))).toBe('без размеров');
  });

  it('is named and its types are translated in ru, kk and en', () => {
    for (const locale of [ru, kk, en]) {
      expect(locale.categories['dom-i-byt']).toBeTruthy();
      for (const type of homeTypes) {
        expect((locale.productTypes as Record<string, string>)[type]).toBeTruthy();
      }
    }
    expect(ru.categories['dom-i-byt']).toBe('Дом и быт');
  });
});
