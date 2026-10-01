import { useTranslation } from 'react-i18next';

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
