import type { CategoryDto, ProductDto } from './api/types';
import type { Category, Gender, Product } from './types';

const GENDER_MAP: Record<number, Gender> = { 0: 'male', 1: 'female', 2: 'kids' };

export const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
export const KIDS_SHOE_SIZES = ['26', '27', '28', '29', '30', '31', '32', '33', '34', '35'];
export const SHOE_SIZES = ['36', '37', '38', '39', '40'];

/** Sorts a mixed list of sizes into the canonical order (S..4XL, kids shoes, adult shoes), not alphabetically. */
export function sortSizes(sizes: string[]): string[] {
  const order = [...CLOTHING_SIZES, ...KIDS_SHOE_SIZES, ...SHOE_SIZES];
  return [...sizes].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 || ib === -1) return a.localeCompare(b);
    return ia - ib;
  });
}

const SHOE_TYPES = ['Ботинки', 'Кроссовки'];
const SIZELESS_TYPES = ['Сумки', 'Рюкзаки'];

export function mapCategory(dto: CategoryDto): Category {
  return { id: String(dto.id), name: dto.name, slug: dto.slug, hasSizes: dto.hasSizes };
}

/** Size grid by what the product is: shoes and bags live in the gender categories next to clothes. */
export function sizesFor(categoryId: number, categories: Category[], productType?: string | null): string[] {
  const category = categories.find((c) => c.id === String(categoryId));
  if (!category?.hasSizes) return [];
  if (productType && SHOE_TYPES.includes(productType)) return category.slug === 'kids' ? KIDS_SHOE_SIZES : SHOE_SIZES;
  if (productType && SIZELESS_TYPES.includes(productType)) return [];
  return CLOTHING_SIZES;
}

/** What the customer can pick: the admin's selection (within the grid of the product's type), or the whole grid
 * when none was made (null - what every product had before sizes became editable). */
export function productSizes(dto: ProductDto, categories: Category[]): string[] {
  const grid = sizesFor(dto.categoryId, categories, dto.productType);
  if (grid.length === 0 || !dto.availableSizes) return grid;
  return sortSizes(dto.availableSizes.filter((s) => grid.includes(s)));
}

export function mapProduct(dto: ProductDto, categories: Category[]): Product {
  return {
    id: String(dto.id),
    name: dto.name,
    description: dto.description,
    price: dto.price,
    discountPrice: dto.discountPrice ?? undefined,
    stock: dto.stock,
    categoryId: String(dto.categoryId),
    gender: GENDER_MAP[dto.gender] ?? 'female',
    images: dto.images,
    sizes: productSizes(dto, categories),
    isBestseller: dto.isBestseller,
    createdAt: dto.createdAt,
    averageRating: dto.averageRating,
    reviewCount: dto.reviewCount,
    productType: dto.productType ?? undefined,
  };
}

/** "12 900 ₸" with a non-breaking space grouping, without relying on Intl being present. */
export function formatPrice(value: number): string {
  const grouped = Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ₸`;
}

export function discountPercent(price: number, discountPrice?: number): number | null {
  if (discountPrice === undefined || discountPrice >= price) return null;
  return Math.round((1 - discountPrice / price) * 100);
}
