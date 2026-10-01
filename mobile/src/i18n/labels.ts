import { useTranslation } from 'react-i18next';
import type { FieldError } from '../lib/validation';

type Translate = (key: string, options?: { defaultValue?: string }) => string;

/** Category and product-type names come from the database; known ones are translated, others shown as stored. */
export function useLabels() {
  const { t } = useTranslation();
  const translate = t as unknown as Translate;
  return {
    categoryName: (category: { slug: string; name: string }) =>
      translate(`categories.${category.slug}`, { defaultValue: category.name }),
    productType: (type: string) => translate(`productTypes.${type}`, { defaultValue: type }),
  };
}

type TranslateWith = (key: string, options?: Record<string, string | number>) => string;

/** Turns a validation result (a translation key + params) into text in the current language. */
export function useFieldError() {
  const { t } = useTranslation();
  const translate = t as unknown as TranslateWith;
  return (error: FieldError | null): string | null => (error ? translate(error.key, error.params) : null);
}
