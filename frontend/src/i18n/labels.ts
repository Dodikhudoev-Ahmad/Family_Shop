import { useTranslation } from 'react-i18next';
import type { Category } from '../types/product';

type Translate = (key: string, options?: { defaultValue?: string }) => string;

/**
 * Names that come from the database but are part of the shop's navigation (categories, product
 * types). Known ones are translated by slug / Russian name; an unknown one - e.g. a category an
 * admin just created - is shown exactly as stored, never as a raw key.
 */
export function useLabels() {
  const { t } = useTranslation();
  const translate = t as unknown as Translate;
  return {
    categoryName: (category: Pick<Category, 'slug' | 'name'>) =>
      translate(`categories.${category.slug}`, { defaultValue: category.name }),
    productType: (type: string) => translate(`productTypes.${type}`, { defaultValue: type }),
  };
}
