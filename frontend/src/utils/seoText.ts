import type { TFunction } from 'i18next';
import { SITE_NAME, truncateDescription } from '../data/seo';
import type { Product } from '../types/product';
import { formatPrice } from './formatPrice';

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 150;

const effectivePrice = (p: Product) => p.discountPrice ?? p.price;

/** Title and description of a product page (docs/Seo.md, section 3). The title stays within 60 characters by cutting the name. */
export function productSeoText(t: TFunction, product: Product): { title: string; description: string } {
  const price = formatPrice(effectivePrice(product));
  const overhead = t('seo.productTitle', { name: '', price, site: SITE_NAME }).length;
  const name = truncateDescription(product.name, Math.max(10, TITLE_MAX - overhead));
  const description = truncateDescription(product.description, DESCRIPTION_MAX);
  return {
    title: t('seo.productTitle', { name, price, site: SITE_NAME }),
    description: description || t('seo.productDescriptionFallback', { name: product.name, site: SITE_NAME }),
  };
}

/** Title and description of a category page; the numbers appear once the category's products are loaded. */
export function categorySeoText(t: TFunction, name: string, products: Product[]): { title: string; description: string } {
  const title = t('seo.categoryTitle', { name, site: SITE_NAME });
  if (products.length === 0) return { title, description: t('seo.categoryDescription', { name, site: SITE_NAME }) };
  const min = formatPrice(Math.min(...products.map(effectivePrice)));
  return { title, description: t('seo.categoryDescriptionStats', { name, count: products.length, min, site: SITE_NAME }) };
}
