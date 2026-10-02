export interface ApiResponse<T> {
  success: boolean;
  data: T;
  errors: string[];
  /** Machine-readable failure kind, e.g. 'out_of_stock' or 'conflict' (HTTP 409). */
  code?: string;
  /** Details for `code`, e.g. { productId, productName, available }. */
  meta?: Record<string, unknown>;
}

/** 0=Male, 1=Female, 2=Kids — matches backend FamilyShop.Domain.Entities.Gender enum order. */
export type ApiGender = 0 | 1 | 2;

export interface ProductDto {
  id: number;
  name: string;
  description: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  categoryId: number;
  gender: ApiGender;
  images: string[];
  createdAt: string;
  isBestseller: boolean;
  averageRating: number;
  reviewCount: number;
  productType: string | null;
  /** Sizes the admin sells this product in; null = every size of the grid of its type. */
  availableSizes?: string[] | null;
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  parentCategoryId: number | null;
  hasSizes: boolean;
}

export type ProductSortBy = 0 | 1 | 2 | 3; // 0=Newest, 1=PriceAsc, 2=PriceDesc, 3=Popular

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
