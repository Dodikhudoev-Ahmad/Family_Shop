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

/** Matches backend Domain ShoeSegment (the order is the stored value): who a pair of shoes is for, which decides its grid. */
export const SHOE_SEGMENT = { Men: 0, Women: 1, Kids: 2, Teen: 3 } as const;
export type ApiShoeSegment = (typeof SHOE_SEGMENT)[keyof typeof SHOE_SEGMENT];

/** Matches backend Domain ChildGender: the sex of a kids' or teen shoe. */
export const CHILD_GENDER = { Boy: 0, Girl: 1 } as const;
export type ApiChildGender = (typeof CHILD_GENDER)[keyof typeof CHILD_GENDER];

/** One size of the product's grid; `available` = offered by the shop and in stock. */
export interface ProductSizeDto {
  size: string;
  available: boolean;
}

/** The size grid of one shoe segment, as the server defines it (the only source of the ranges). */
export interface ShoeSizeGridDto {
  segment: ApiShoeSegment;
  gender: ApiGender;
  sizes: string[];
  /** Empty for adult segments, boy and girl for kids and teen. */
  childGenders: ApiChildGender[];
}

export interface SizeGridsDto {
  shoes: ShoeSizeGridDto[];
}

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
  /** Shoes only: who they are for; absent from an API that predates segments. */
  shoeSegment?: ApiShoeSegment | null;
  /** Kids' and teen shoes: boy or girl; null where the shop has not decided yet. */
  childGender?: ApiChildGender | null;
  /** The whole grid of the product with availability; absent from an API that predates segments. */
  sizes?: ProductSizeDto[] | null;
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  parentCategoryId: number | null;
  hasSizes: boolean;
  /** Display order (ascending); absent from an API that predates the field. */
  sortOrder?: number;
}

export type ProductSortBy = 0 | 1 | 2 | 3; // 0=Newest, 1=PriceAsc, 2=PriceDesc, 3=Popular

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
