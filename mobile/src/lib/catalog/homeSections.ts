import { discountPercent } from '../mappers';
import type { Category, Product } from '../types';

export const HOME_SECTION_SIZE = 10;

export interface HomeSections {
  hits: Product[];
  newest: Product[];
  discounted: Product[];
}

/** The three horizontal sections of the home screen, cut from the whole catalogue. */
export function homeSections(products: Product[], size = HOME_SECTION_SIZE): HomeSections {
  const inStock = products.filter((p) => p.stock > 0);
  return {
    hits: inStock.filter((p) => p.isBestseller).slice(0, size),
    newest: [...inStock].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, size),
    discounted: inStock
      .filter((p) => p.discountPrice !== undefined)
      .sort((a, b) => (discountPercent(b.price, b.discountPrice) ?? 0) - (discountPercent(a.price, a.discountPrice) ?? 0))
      .slice(0, size),
  };
}

/** A category tile's picture: its bestseller's photo, else its first product's. Undefined for an empty category. */
export function categoryCover(products: Product[], categoryId: string): string | undefined {
  const own = products.filter((p) => p.categoryId === categoryId && p.images[0]);
  return (own.find((p) => p.isBestseller) ?? own[0])?.images[0];
}

export type AppLink =
  | { screen: 'Catalog'; categoryId?: number; discount?: boolean }
  | { screen: 'Product'; productId: number };

/** Maps an in-app path from a banner ("/catalog/women", "/catalog?discount=true", "/product/7") to a screen. */
export function resolveInternalPath(path: string, categories: Category[]): AppLink | null {
  const [pathname, query = ''] = path.split('?');
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'product' && /^\d+$/.test(parts[1] ?? '')) return { screen: 'Product', productId: Number(parts[1]) };
  if (parts[0] === 'catalog') {
    const discount = new URLSearchParams(query).get('discount') === 'true' ? true : undefined;
    if (parts[1]) {
      const category = categories.find((c) => c.slug === parts[1]);
      return category ? { screen: 'Catalog', categoryId: Number(category.id), discount } : null;
    }
    return { screen: 'Catalog', discount };
  }
  return null;
}

/** Same-category items for "Похожие товары", same product type first (shoes next to shoes), at most `size`. */
export function relatedProducts(products: Product[], product: Product, size = 8): Product[] {
  return products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .sort((a, b) => Number(b.productType === product.productType) - Number(a.productType === product.productType))
    .slice(0, size);
}

/** "2026-03-07T10:00:00Z" -> "07.03.2026" (no Intl: it is not guaranteed on every JS engine). */
export function formatReviewDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
