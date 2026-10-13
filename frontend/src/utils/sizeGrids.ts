import { CLOTHING_SIZES } from '../lib/mappers';
import { SHOE_SEGMENT, type ApiGender, type ApiShoeSegment, type ShoeSizeGridDto } from '../types/api';

/** The size grids as the admin form shows them. Clothing is the same on the server (Domain SizeGrids); the shoe grids
 * are the server's own, fetched from /products/size-grids and chosen by the product's segment - no ranges live here.
 * The grid follows the product TYPE (shoes and bags live in Женское/Мужское/Детское next to clothes), not the category. */
export type SizeGridKey = 'clothing' | 'shoes';

export interface SizeGrid {
  key: SizeGridKey;
  label: string;
  sizes: string[];
}

const SEGMENT_LABEL: Record<ApiShoeSegment, string> = {
  [SHOE_SEGMENT.Men]: 'Мужская обувь',
  [SHOE_SEGMENT.Women]: 'Женская обувь',
  [SHOE_SEGMENT.Kids]: 'Детская обувь',
  [SHOE_SEGMENT.Teen]: 'Подростковая обувь',
};

/** The name of a shoe segment for the admin ("Детская обувь"). */
export function segmentLabel(segment: ApiShoeSegment): string {
  return SEGMENT_LABEL[segment];
}

interface CategoryLike {
  slug: string;
  hasSizes: boolean;
}

const SHOE_TYPES = ['Ботинки', 'Кроссовки'];
const SIZELESS_TYPES = ['Сумки', 'Рюкзаки'];

const CLOTHING_TYPES = [
  'Костюмы', 'Платья', 'Комбинезоны', 'Пальто', 'Куртки', 'Пиджаки и жакеты', 'Блузки', 'Рубашки', 'Свитеры', 'Худи', 'Брюки',
  'Футболки', 'Боди',
];
const GENDER_CATEGORY_TYPES = [...CLOTHING_TYPES, 'Кроссовки', 'Ботинки', 'Сумки', 'Рюкзаки'];

const TYPES_BY_CATEGORY_SLUG: Record<string, string[]> = {
  women: GENDER_CATEGORY_TYPES,
  men: GENDER_CATEGORY_TYPES,
  kids: GENDER_CATEGORY_TYPES,
  'bytovaya-tehnika': ['Микроволновки', 'Холодильники', 'Плиты и духовки', 'Наушники и колонки', 'Тостеры', 'Вентиляторы', 'Кофемолки', 'Фены', 'Чайники'],
  'dom-i-byt': ['Этажерки', 'Органайзеры', 'Системы хранения', 'Декор'],
  sport: ['Штанги и диски', 'Гантели', 'Тренажёры', 'Экипировка'],
  posuda: ['Чайники', 'Ножи', 'Кружки и чашки', 'Тарелки', 'Миски', 'Бокалы', 'Кастрюли', 'Кухонные аксессуары'],
  aksessuary: ['Украшения', 'Часы', 'Чехлы'],
};

const ALL_TYPES = [...new Set(Object.values(TYPES_BY_CATEGORY_SLUG).flat())];

/** The product types an admin can pick in a category. A category the shop added itself offers every type. */
export function productTypesFor(categorySlug: string | undefined): string[] {
  return (categorySlug && TYPES_BY_CATEGORY_SLUG[categorySlug]) || ALL_TYPES;
}

export function isShoeType(productType: string | null | undefined): boolean {
  return !!productType && SHOE_TYPES.includes(productType);
}

/** The segments a shoe of this gender can belong to: one for men and women, kids and teen for the children. */
export function shoeGridsForGender(grids: ShoeSizeGridDto[], gender: ApiGender): ShoeSizeGridDto[] {
  return grids.filter((g) => g.gender === gender);
}

/** The grid a shoe has: its chosen segment when that fits the gender, otherwise the first one that does. */
export function pickShoeGrid(grids: ShoeSizeGridDto[], gender: ApiGender, segment: ApiShoeSegment | null): ShoeSizeGridDto | null {
  const candidates = shoeGridsForGender(grids, gender);
  return candidates.find((g) => g.segment === segment) ?? candidates[0] ?? null;
}

/** The full grid a product of this type in this category can be sold in; null when it has no sizes at all. Shoes take
 * the grid of their segment (`shoeGrid`), which the caller picks with {@link pickShoeGrid}. */
export function sizeGridFor(
  category: CategoryLike | undefined,
  productType: string | null | undefined,
  shoeGrid: ShoeSizeGridDto | null = null,
): SizeGrid | null {
  if (!category?.hasSizes) return null;
  if (productType && SIZELESS_TYPES.includes(productType)) return null;
  if (isShoeType(productType)) {
    return shoeGrid ? { key: 'shoes', label: segmentLabel(shoeGrid.segment), sizes: shoeGrid.sizes } : null;
  }
  return { key: 'clothing', label: 'Одежда', sizes: CLOTHING_SIZES };
}

/** A short line for the products list: "S–XL", "36–40", "M, 3XL" or "без размеров". null sizes = the whole grid. */
export function summarizeSizes(available: string[] | null | undefined, grid: SizeGrid | null): string {
  if (!grid) return 'без размеров';
  const chosen = available ? grid.sizes.filter((s) => available.includes(s)) : grid.sizes;
  if (chosen.length === 0) return 'без размеров';
  if (chosen.length === 1) return chosen[0];

  const indexes = chosen.map((s) => grid.sizes.indexOf(s));
  const contiguous = indexes.every((index, i) => i === 0 || index === indexes[i - 1] + 1);
  return contiguous ? `${chosen[0]}–${chosen[chosen.length - 1]}` : chosen.join(', ');
}
