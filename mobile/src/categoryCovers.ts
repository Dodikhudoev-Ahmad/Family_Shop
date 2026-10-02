/**
 * Pictures for the category tiles on the home screen - the ONE place to change them.
 *
 * Women / Men / Kids use the same three photos as the website's hero tiles (frontend/src/data/heroImages.ts).
 * Every other category is shown by a product of a fitting TYPE (never shoes or bags, never a person on a kids' photo).
 *
 * How to change a cover, per category slug, in order of priority:
 *  1. `image`      - a fixed picture (https URL);
 *  2. `productIds` - ids of products whose first photo is used (the first one found in the catalogue wins; ids are
 *                    per database, so prefer `types` unless the catalogue is stable);
 *  3. `types`      - product types in order of preference (the bestseller of a type goes first).
 * A category with no rule (or no matching product) falls back to any product that is not footwear or a bag.
 */
export interface CoverRule {
  image?: string;
  productIds?: number[];
  types?: string[];
}

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&h=1100&fit=crop&q=80`;

export const CATEGORY_COVERS: Record<string, CoverRule> = {
  women: { image: unsplash('1662532577856-e8ee8b138a8b') },
  men: { image: unsplash('1519085360753-af0119f7cbe7') },
  kids: { image: unsplash('1624272949900-9ae4c56397e8') },
  'bytovaya-tehnika': { types: ['Холодильники', 'Микроволновки', 'Плиты и духовки', 'Тостеры', 'Кофемолки', 'Фены', 'Вентиляторы'] },
  sport: { types: ['Гантели', 'Штанги и диски', 'Тренажёры', 'Экипировка'] },
  posuda: { types: ['Чайники', 'Кастрюли', 'Тарелки', 'Кружки и чашки', 'Бокалы'] },
  aksessuary: { types: ['Часы', 'Украшения', 'Чехлы'] },
};

/** The three categories the website presents as large hero tiles, in its order. */
export const HERO_SLUGS = ['women', 'men', 'kids'] as const;

/** Types that must never stand in for a whole category when no rule matches. */
export const COVER_FALLBACK_EXCLUDED_TYPES = ['Кроссовки', 'Ботинки', 'Сумки', 'Рюкзаки'];
