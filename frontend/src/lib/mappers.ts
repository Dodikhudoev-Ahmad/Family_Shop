import type { CategoryDto, ProductDto } from '../types/api';
import type { Category, Gender, Product } from '../types/product';

const GENDER_MAP: Record<number, Gender> = { 0: 'male', 1: 'female', 2: 'kids' };

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['36', '37', '38', '39', '40'];

export function mapCategory(dto: CategoryDto): Category {
  return { id: String(dto.id), name: dto.name, slug: dto.slug, hasSizes: dto.hasSizes };
}

function sizesFor(categoryId: number, categories: Category[]): string[] {
  const category = categories.find((c) => c.id === String(categoryId));
  if (!category?.hasSizes) return [];
  return category.slug === 'shoes-bags' ? SHOE_SIZES : CLOTHING_SIZES;
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
    sizes: sizesFor(dto.categoryId, categories),
    isBestseller: dto.isBestseller,
    createdAt: dto.createdAt,
    averageRating: dto.averageRating,
    reviewCount: dto.reviewCount,
  };
}
