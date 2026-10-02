import { describe, expect, it } from 'vitest';
import { productTypesFor, sizeGridFor, summarizeSizes } from './sizeGrids';

const women = { slug: 'women', hasSizes: true };
const kids = { slug: 'kids', hasSizes: true };
const appliances = { slug: 'bytovaya-tehnika', hasSizes: false };

describe('sizeGridFor', () => {
  it('follows the type, not the category', () => {
    expect(sizeGridFor(women, 'Худи')?.sizes).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(sizeGridFor(women, 'Кроссовки')).toMatchObject({ label: 'Обувь', sizes: ['36', '37', '38', '39', '40'] });
    expect(sizeGridFor(kids, 'Ботинки')).toMatchObject({ label: 'Детская обувь', sizes: ['26', '27', '28', '29', '30', '31', '32', '33', '34', '35'] });
    expect(sizeGridFor(women, 'Сумки')).toBeNull();
    expect(sizeGridFor(kids, 'Рюкзаки')).toBeNull();
  });

  it('has no grid for categories without sizes or an unknown category', () => {
    expect(sizeGridFor(appliances, 'Холодильники')).toBeNull();
    expect(sizeGridFor(undefined, 'Худи')).toBeNull();
  });
});

describe('summarizeSizes', () => {
  const clothing = sizeGridFor(women, 'Худи');
  const shoes = sizeGridFor(women, 'Кроссовки');

  it('summarises ranges, scattered sizes, one size and the whole grid', () => {
    expect(summarizeSizes(['S', 'M', 'L', 'XL'], clothing)).toBe('S–XL');
    expect(summarizeSizes(['M', '3XL'], clothing)).toBe('M, 3XL');
    expect(summarizeSizes(['M'], clothing)).toBe('M');
    expect(summarizeSizes(null, clothing)).toBe('S–4XL');
    expect(summarizeSizes(null, shoes)).toBe('36–40');
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
    expect(productTypesFor('some-new-category')).toEqual(expect.arrayContaining(['Худи', 'Холодильники']));
  });
});
