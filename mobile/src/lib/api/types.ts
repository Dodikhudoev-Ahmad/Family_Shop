export interface ApiResponse<T> {
  success: boolean;
  data: T;
  errors: string[];
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 0=Male, 1=Female, 2=Kids - matches backend Gender enum order. */
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
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  parentCategoryId: number | null;
  hasSizes: boolean;
}

/** 0=Newest, 1=PriceAsc, 2=PriceDesc, 3=Popular */
export type ProductSortBy = 0 | 1 | 2 | 3;

export type ApiUserRole = 'Customer' | 'Admin';

/** Response of /auth/mobile/{register,login,refresh}. The two tokens never leave the api layer. */
export interface MobileAuthResponseDto {
  userId: number;
  email: string;
  name: string;
  role: ApiUserRole;
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: ApiUserRole;
}

export interface SessionDto {
  sessionId: string;
  clientType: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

/** 0=Created, 1=Processing, 2=Shipped, 3=Delivered, 4=Cancelled */
export type ApiOrderStatus = 0 | 1 | 2 | 3 | 4;
/** 0=Courier, 1=Pickup */
export type ApiDeliveryMethod = 0 | 1;

export interface OrderItemDto {
  productId: number;
  productName: string;
  productImage: string | null;
  quantity: number;
  price: number;
  size: string | null;
}

export interface OrderDto {
  id: number;
  status: ApiOrderStatus;
  totalPrice: number;
  createdAt: string;
  contactName: string;
  contactPhone: string;
  deliveryMethod: ApiDeliveryMethod;
  city: string | null;
  address: string | null;
  items: OrderItemDto[];
  promoCode: string | null;
  discountAmount: number;
}

export interface CreateOrderRequest {
  items: { productId: number; quantity: number; size: string | null }[];
  contactName?: string;
  contactPhone: string;
  deliveryMethod: ApiDeliveryMethod;
  address?: string;
  promoCode?: string;
}

/** 0=Home, 1=Cart, 2=Both - matches backend PromoBannerPlacement. */
export type ApiPromoBannerPlacement = 0 | 1 | 2;

export interface PromoBannerDto {
  id: number;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  placement: ApiPromoBannerPlacement;
}

export interface ReviewDto {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/** 0=Percentage, 1=FixedAmount - matches backend PromoCodeDiscountType. */
export type ApiPromoCodeDiscountType = 0 | 1;

export interface PromoCodeApplicationDto {
  promoCodeId: number;
  code: string;
  discountType: ApiPromoCodeDiscountType;
  discountValue: number;
  discountAmount: number;
  finalTotal: number;
}
