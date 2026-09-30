import type { CategoryDto, ProductDto } from '../types/api';
import type { Category, Gender, Product } from '../types/product';

const GENDER_MAP: Record<number, Gender> = { 0: 'male', 1: 'female', 2: 'kids' };

export const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
export const KIDS_SHOE_SIZES = ['26', '27', '28', '29', '30', '31', '32', '33', '34', '35'];
export const SHOE_SIZES = ['36', '37', '38', '39', '40'];

/** Sorts a mixed list of sizes (clothing or shoe) into the canonical order above,
 * instead of alphabetically (which would put '2XL' before 'L', 'XL' before 'XS', etc). */
export function sortSizes(sizes: string[]): string[] {
  const order = [...CLOTHING_SIZES, ...KIDS_SHOE_SIZES, ...SHOE_SIZES];
  return [...sizes].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 || ib === -1) return a.localeCompare(b);
    return ia - ib;
  });
}

export function mapCategory(dto: CategoryDto): Category {
  return { id: String(dto.id), name: dto.name, slug: dto.slug, hasSizes: dto.hasSizes };
}
const SHOE_TYPES = ['Ботинки', 'Кроссовки'];
// Bags come in one size; they sit in the gender categories now, so they must not inherit
// the clothing grid from them.
const SIZELESS_TYPES = ['Сумки', 'Рюкзаки'];

/** Size grid by what the product is, not by which category it sits in: shoes and bags live
 * in Женское/Мужское/Детское next to clothes. */
export function sizesFor(categoryId: number, categories: Category[], productType?: string | null): string[] {
  const category = categories.find((c) => c.id === String(categoryId));
  if (!category?.hasSizes) return [];
  if (productType && SHOE_TYPES.includes(productType)) return category.slug === 'kids' ? KIDS_SHOE_SIZES : SHOE_SIZES;
  if (productType && SIZELESS_TYPES.includes(productType)) return [];
  return CLOTHING_SIZES;
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
    sizes: sizesFor(dto.categoryId, categories, dto.productType),
    isBestseller: dto.isBestseller,
    createdAt: dto.createdAt,
    averageRating: dto.averageRating,
    reviewCount: dto.reviewCount,
    productType: dto.productType ?? undefined,
  };
}
