import { CLOTHING_SIZES, KIDS_SHOE_SIZES, SHOE_SIZES } from '../lib/mappers';

/** The size grids as the admin form shows them. They mirror the server (Domain SizeGrids): the grid follows the
 * product TYPE (shoes and bags live in Женское/Мужское/Детское next to clothes), not the category. */
export type SizeGridKey = 'clothing' | 'shoes' | 'kidsShoes';

export interface SizeGrid {
  key: SizeGridKey;
  label: string;
  sizes: string[];
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
  'bytovaya-tehnika': ['Микроволновки', 'Холодильники', 'Плиты и духовки', 'Наушники и колонки', 'Тостеры', 'Вентиляторы', 'Кофемолки', 'Фены'],
  sport: ['Штанги и диски', 'Гантели', 'Тренажёры', 'Экипировка'],
  posuda: ['Чайники', 'Ножи', 'Кружки и чашки', 'Тарелки', 'Миски', 'Бокалы', 'Кастрюли', 'Кухонные аксессуары'],
  aksessuary: ['Украшения', 'Часы', 'Чехлы'],
};

const ALL_TYPES = [...new Set(Object.values(TYPES_BY_CATEGORY_SLUG).flat())];

/** The product types an admin can pick in a category. A category the shop added itself offers every type. */
export function productTypesFor(categorySlug: string | undefined): string[] {
  return (categorySlug && TYPES_BY_CATEGORY_SLUG[categorySlug]) || ALL_TYPES;
}

/** The full grid a product of this type in this category can be sold in; null when it has no sizes at all. */
export function sizeGridFor(category: CategoryLike | undefined, productType: string | null | undefined): SizeGrid | null {
  if (!category?.hasSizes) return null;
  if (productType && SIZELESS_TYPES.includes(productType)) return null;
  if (productType && SHOE_TYPES.includes(productType)) {
    return category.slug === 'kids'
      ? { key: 'kidsShoes', label: 'Детская обувь', sizes: KIDS_SHOE_SIZES }
      : { key: 'shoes', label: 'Обувь', sizes: SHOE_SIZES };
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
