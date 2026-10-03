import { api } from './client';
import type {
  CategoryDto,
  CreateOrderRequest,
  OrderDto,
  ApiPromoBannerPlacement,
  PagedResult,
  ProductDto,
  PromoCodeApplicationDto,
  PromoBannerDto,
  ReviewDto,
  ReviewSortBy,
  ReviewSummaryDto,
  ProductSortBy,
} from './types';

export interface ProductQuery {
  gender?: 0 | 1 | 2;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: ProductSortBy;
  page?: number;
  pageSize?: number;
  productType?: string;
}

function buildQuery(query: ProductQuery): string {
  const params = new URLSearchParams();
  (Object.entries(query) as [string, string | number | undefined][]).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function fetchCategories(): Promise<CategoryDto[]> {
  return api.request<CategoryDto[]>('/categories');
}

export function fetchProductsPage(query: ProductQuery = {}): Promise<PagedResult<ProductDto>> {
  return api.request<PagedResult<ProductDto>>(`/products${buildQuery(query)}`);
}

const FETCH_ALL_PAGE_SIZE = 200;

/** The whole catalogue, page by page until the server says `hasMore: false` - a single request would
 * silently cut the list off as soon as the shop outgrows one page. */
export async function fetchAllProducts(): Promise<ProductDto[]> {
  const items: ProductDto[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchProductsPage({ page, pageSize: FETCH_ALL_PAGE_SIZE });
    items.push(...result.items);
    if (!result.hasMore) return items;
  }
}

export function fetchActivePromoBanners(placement: ApiPromoBannerPlacement): Promise<PromoBannerDto[]> {
  return api.request<PromoBannerDto[]>(`/promo-banners/active?placement=${placement}`);
}

export function fetchProductReviews(productId: number, page: number, pageSize: number, sortBy: ReviewSortBy = 0): Promise<PagedResult<ReviewDto>> {
  return api.request<PagedResult<ReviewDto>>(`/products/${productId}/reviews?sortBy=${sortBy}&page=${page}&pageSize=${pageSize}`);
}

export function fetchReviewSummary(productId: number): Promise<ReviewSummaryDto> {
  return api.request<ReviewSummaryDto>(`/products/${productId}/reviews/summary`);
}

/** The signed-in user's own review of the product, or null when they have not written one. */
export function fetchMyReview(productId: number): Promise<ReviewDto | null> {
  return api.request<ReviewDto | null>(`/products/${productId}/reviews/mine`, { auth: 'required' });
}

export function createReview(productId: number, rating: number, comment: string): Promise<ReviewDto> {
  return api.request<ReviewDto>(`/products/${productId}/reviews`, { method: 'POST', body: { rating, comment }, auth: 'required' });
}

export function deleteMyReview(productId: number): Promise<void> {
  return api.request<void>(`/products/${productId}/reviews`, { method: 'DELETE', auth: 'required' });
}

export function fetchProduct(id: number): Promise<ProductDto> {
  return api.request<ProductDto>(`/products/${id}`);
}

export function createOrder(request: CreateOrderRequest, idempotencyKey?: string): Promise<OrderDto> {
  // The key lets the server recognise a repeated request (double tap, retry after a lost answer) and not create a second order.
  return api.request<OrderDto>('/orders', {
    method: 'POST',
    body: request,
    auth: 'required',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function fetchOrders(): Promise<OrderDto[]> {
  return api.request<OrderDto[]>('/orders', { auth: 'required' });
}

/** Preview of a promo code against the cart subtotal. The order itself is priced again on the server. */
export function validatePromoCode(code: string, orderSubtotal: number): Promise<PromoCodeApplicationDto> {
  return api.request<PromoCodeApplicationDto>('/promo-codes/validate', { method: 'POST', body: { code, orderSubtotal } });
}
