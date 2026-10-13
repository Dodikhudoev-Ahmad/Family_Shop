import type { ApiChildGender, ApiShoeSegment, CategoryDto, ProductDto } from '../types/api';
import type { Category, ChildGender, Gender, Product, ShoeSegment } from '../types/product';

const GENDER_MAP: Record<number, Gender> = { 0: 'male', 1: 'female', 2: 'kids' };
const SEGMENT_MAP: Record<ApiShoeSegment, ShoeSegment> = { 0: 'men', 1: 'women', 2: 'kids', 3: 'teen' };
const CHILD_GENDER_MAP: Record<ApiChildGender, ChildGender> = { 0: 'boy', 1: 'girl' };

export const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

/** Sorts a mixed list of sizes (clothing or shoe): clothing in its canonical order (not alphabetically, which would
 * put '2XL' before 'L'), then shoe sizes by number. */
export function sortSizes(sizes: string[]): string[] {
  const rank = (size: string) => {
    const clothing = CLOTHING_SIZES.indexOf(size);
    if (clothing !== -1) return clothing;
    const number = Number(size);
    return Number.isNaN(number) ? Infinity : CLOTHING_SIZES.length + number;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function mapCategory(dto: CategoryDto): Category {
  return { id: String(dto.id), name: dto.name, slug: dto.slug, hasSizes: dto.hasSizes, sortOrder: dto.sortOrder ?? 0 };
}
const SHOE_TYPES = ['Ботинки', 'Кроссовки'];
// Bags come in one size; they sit in the gender categories now, so they must not inherit
// the clothing grid from them.
const SIZELESS_TYPES = ['Сумки', 'Рюкзаки'];

/** Fallback grid for a product that comes without the server's one: by what the product is, not by which category it
 * sits in (shoes and bags live in Женское/Мужское/Детское next to clothes). Shoes get none here - their ranges are the
 * server's, sent with each product. */
export function sizesFor(categoryId: number, categories: Category[], productType?: string | null): string[] {
  const category = categories.find((c) => c.id === String(categoryId));
  if (!category?.hasSizes) return [];
  if (productType && SHOE_TYPES.includes(productType)) return [];
  if (productType && SIZELESS_TYPES.includes(productType)) return [];
  return CLOTHING_SIZES;
}

/** The whole grid of the product: the server's when it sends one (it owns the shoe ranges), else the local rule. */
function gridSizesOf(dto: ProductDto, categories: Category[]): string[] {
  return dto.sizes ? dto.sizes.map((s) => s.size) : sizesFor(dto.categoryId, categories, dto.productType);
}

/** What the customer can pick: the admin's selection (within the grid of the product's type), or the whole grid
 * when none was made (null - what every product had before sizes became editable). */
export function productSizes(dto: ProductDto, categories: Category[]): string[] {
  const grid = gridSizesOf(dto, categories);
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
    gridSizes: gridSizesOf(dto, categories),
    isBestseller: dto.isBestseller,
    createdAt: dto.createdAt,
    averageRating: dto.averageRating,
    reviewCount: dto.reviewCount,
    productType: dto.productType ?? undefined,
    shoeSegment: dto.shoeSegment != null ? SEGMENT_MAP[dto.shoeSegment] : undefined,
    childGender: dto.childGender != null ? CHILD_GENDER_MAP[dto.childGender] : undefined,
  };
}
