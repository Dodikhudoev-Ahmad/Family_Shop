import type { Product } from '../types/product';

/** A product counts as "Новинка" for this many days after it was added to the catalog. */
export const NEW_PRODUCT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Discount in whole percent (rounded), or null when the product is not discounted. */
export function discountPercentOf(product: Pick<Product, 'price' | 'discountPrice'>): number | null {
  if (!product.discountPrice || product.discountPrice >= product.price) return null;
  const percent = Math.round((1 - product.discountPrice / product.price) * 100);
  return percent > 0 ? percent : null;
}

export function isNewProduct(product: Pick<Product, 'createdAt'>, now: number = Date.now()): boolean {
  const created = new Date(product.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const age = now - created;
  // A creation date in the future (clock skew) still reads as new.
  return age <= NEW_PRODUCT_DAYS * DAY_MS;
}

export function isHitProduct(product: Pick<Product, 'isBestseller'>): boolean {
  return product.isBestseller === true;
}

/** The biggest discount among the products, or null when none is discounted. */
export function maxDiscountPercent(products: Pick<Product, 'price' | 'discountPrice'>[]): number | null {
  let max = 0;
  for (const p of products) max = Math.max(max, discountPercentOf(p) ?? 0);
  return max > 0 ? max : null;
}

export type QuickFilter = 'sale' | 'new' | 'hits';

export const QUICK_FILTERS: readonly QuickFilter[] = ['sale', 'new', 'hits'];

/** How many products one quick-filter selection shows on the home page. */
export const QUICK_PICK_LIMIT = 8;

/** Products for a home-page chip: newest first for "new", the catalog order otherwise. */
export function pickProducts(products: Product[], filter: QuickFilter, now: number = Date.now()): Product[] {
  const byNewest = (a: Product, b: Product) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  switch (filter) {
    case 'sale':
      return products.filter((p) => discountPercentOf(p) !== null).slice(0, QUICK_PICK_LIMIT);
    case 'hits':
      return products.filter(isHitProduct).slice(0, QUICK_PICK_LIMIT);
    case 'new':
      return products
        .filter((p) => isNewProduct(p, now))
        .sort(byNewest)
        .slice(0, QUICK_PICK_LIMIT);
  }
}
