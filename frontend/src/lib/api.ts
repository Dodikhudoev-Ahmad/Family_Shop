import type { ApiGender, ApiResponse, CategoryDto, PagedResult, ProductDto, ProductSortBy } from '../types/api';
import { getAccessToken, setAccessToken } from './authToken';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5280/api/v1';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Не удалось подключиться к серверу. Проверьте, что backend запущен.');
  }
}

// Refresh token lives in an httpOnly cookie, so this call carries no body - the browser
// sends the cookie automatically because of credentials: 'include'. Concurrent 401s share
// one in-flight refresh instead of each firing their own /auth/refresh request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const json = (await res.json()) as ApiResponse<{ accessToken: string }>;
        if (!json.success) return false;
        setAccessToken(json.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  // The rate limiter rejects requests before they reach our controllers, so a 429 body
  // isn't our JSON envelope - handle it separately with a message people can act on.
  if (res.status === 429) {
    throw new ApiError('Слишком много попыток. Попробуйте снова через минуту.');
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`Ошибка сервера (${res.status})`);
  }

  if (!json.success) {
    throw new ApiError(json.errors.join('; ') || 'Запрос не выполнен');
  }

  return json.data;
}

/** Fetches an endpoint behind the standard ApiResponse envelope, retrying once after a
 *  silent token refresh if the server returns 401 (expired access token). */
async function apiFetch<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const res = await rawFetch(path, options);

  if (res.status === 401 && allowRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
    setAccessToken(null);
  }

  return parseEnvelope<T>(res);
}

export interface ProductQuery {
  gender?: 0 | 1 | 2;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: ProductSortBy;
  page?: number;
  pageSize?: number;
}

function buildProductParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.gender !== undefined) params.set('gender', String(query.gender));
  if (query.categoryId !== undefined) params.set('categoryId', String(query.categoryId));
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.search !== undefined) params.set('search', query.search);
  if (query.sortBy !== undefined) params.set('sortBy', String(query.sortBy));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  return params;
}

/** Загружает весь каталог без пагинации (используется контекстами вне страницы каталога). */
export async function fetchProducts(query: ProductQuery = {}): Promise<ProductDto[]> {
  const params = buildProductParams({ ...query, page: 1, pageSize: 200 });
  const result = await apiFetch<PagedResult<ProductDto>>(`/products?${params.toString()}`);
  return result.items;
}

export function fetchProductsPage(query: ProductQuery = {}): Promise<PagedResult<ProductDto>> {
  const qs = buildProductParams(query).toString();
  return apiFetch<PagedResult<ProductDto>>(`/products${qs ? `?${qs}` : ''}`);
}

export function fetchProduct(id: number): Promise<ProductDto> {
  return apiFetch<ProductDto>(`/products/${id}`);
}

export function fetchCategories(): Promise<CategoryDto[]> {
  return apiFetch<CategoryDto[]>('/categories');
}

export type ApiUserRole = 'Customer' | 'Admin';

export interface AuthResponseDto {
  userId: number;
  email: string;
  name: string;
  role: ApiUserRole;
  accessToken: string;
}

export function loginRequest(email: string, password: string): Promise<AuthResponseDto> {
  // 401 here means "wrong credentials", not "expired token" - never trigger a refresh-retry.
  return apiFetch<AuthResponseDto>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false
  );
}

export function registerRequest(email: string, password: string, name: string): Promise<AuthResponseDto> {
  return apiFetch<AuthResponseDto>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ email, password, name }) },
    false
  );
}

/** Attempts to restore a session from the httpOnly refresh cookie (e.g. on page load). */
export async function silentRefresh(): Promise<AuthResponseDto | null> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as ApiResponse<AuthResponseDto>;
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function logoutRequest(): Promise<void> {
  await rawFetch('/auth/logout', { method: 'POST' });
}

/** 0=Created, 1=Processing, 2=Shipped, 3=Delivered, 4=Cancelled - matches backend OrderStatus. */
export type ApiOrderStatus = 0 | 1 | 2 | 3 | 4;
/** 0=Courier, 1=Pickup - matches backend DeliveryMethod. */
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
  contactName: string;
  contactPhone: string;
  deliveryMethod: ApiDeliveryMethod;
  city?: string;
  address?: string;
  promoCode?: string;
}

export function createOrder(request: CreateOrderRequest): Promise<OrderDto> {
  return apiFetch<OrderDto>('/orders', { method: 'POST', body: JSON.stringify(request) });
}

export function fetchOrders(): Promise<OrderDto[]> {
  return apiFetch<OrderDto[]>('/orders');
}

/** 0=Newest, 1=Oldest - matches backend OrderSortBy. */
export type AdminOrderSortBy = 0 | 1;

export interface AdminOrderDto {
  id: number;
  status: ApiOrderStatus;
  totalPrice: number;
  createdAt: string;
  contactName: string;
  contactPhone: string;
  deliveryMethod: ApiDeliveryMethod;
  city: string | null;
  address: string | null;
  itemsCount: number;
  items: OrderItemDto[];
  promoCode: string | null;
  discountAmount: number;
}

export interface OrderStatsDto {
  ordersToday: number;
  revenueToday: number;
  newOrdersCount: number;
  totalOrders: number;
}

export interface AdminOrderQuery {
  status?: ApiOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: AdminOrderSortBy;
  page?: number;
  pageSize?: number;
}

function buildAdminOrderParams(query: AdminOrderQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set('status', String(query.status));
  if (query.dateFrom !== undefined) params.set('dateFrom', query.dateFrom);
  if (query.dateTo !== undefined) params.set('dateTo', query.dateTo);
  if (query.search !== undefined) params.set('search', query.search);
  if (query.sortBy !== undefined) params.set('sortBy', String(query.sortBy));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  return params;
}

export function fetchAdminOrders(query: AdminOrderQuery = {}): Promise<PagedResult<AdminOrderDto>> {
  const qs = buildAdminOrderParams(query).toString();
  return apiFetch<PagedResult<AdminOrderDto>>(`/admin/orders${qs ? `?${qs}` : ''}`);
}

export function fetchAdminOrderStats(): Promise<OrderStatsDto> {
  return apiFetch<OrderStatsDto>('/admin/orders/stats');
}

export function updateAdminOrderStatus(id: number, status: ApiOrderStatus): Promise<AdminOrderDto> {
  return apiFetch<AdminOrderDto>(`/admin/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** 0=Newest, 1=HighestRating, 2=LowestRating - matches backend ReviewSortBy. */
export type ReviewSortBy = 0 | 1 | 2;

export interface ReviewDto {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ReviewSummaryDto {
  averageRating: number;
  reviewCount: number;
  ratingCounts: Record<number, number>;
}

export interface ReviewQuery {
  sortBy?: ReviewSortBy;
  page?: number;
  pageSize?: number;
}

export function fetchProductReviews(productId: number, query: ReviewQuery = {}): Promise<PagedResult<ReviewDto>> {
  const params = new URLSearchParams();
  if (query.sortBy !== undefined) params.set('sortBy', String(query.sortBy));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiFetch<PagedResult<ReviewDto>>(`/products/${productId}/reviews${qs ? `?${qs}` : ''}`);
}

export function fetchReviewSummary(productId: number): Promise<ReviewSummaryDto> {
  return apiFetch<ReviewSummaryDto>(`/products/${productId}/reviews/summary`);
}

export function fetchMyReview(productId: number): Promise<ReviewDto | null> {
  return apiFetch<ReviewDto | null>(`/products/${productId}/reviews/mine`);
}

export function createReview(productId: number, rating: number, comment: string): Promise<ReviewDto> {
  return apiFetch<ReviewDto>(`/products/${productId}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  });
}

export function deleteMyReview(productId: number): Promise<void> {
  return apiFetch<void>(`/products/${productId}/reviews`, { method: 'DELETE' });
}

export interface ProductUpsertRequest {
  name: string;
  description: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  categoryId: number;
  gender: ApiGender;
  images: string[];
  isBestseller: boolean;
}

export function createAdminProduct(request: ProductUpsertRequest): Promise<ProductDto> {
  return apiFetch<ProductDto>('/admin/products', { method: 'POST', body: JSON.stringify(request) });
}

export function updateAdminProduct(id: number, request: ProductUpsertRequest): Promise<ProductDto> {
  return apiFetch<ProductDto>(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(request) });
}

export function deleteAdminProduct(id: number): Promise<void> {
  return apiFetch<void>(`/admin/products/${id}`, { method: 'DELETE' });
}

export async function uploadAdminProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<string>('/admin/products/images', { method: 'POST', body: formData });
}

export interface CategoryUpsertRequest {
  name: string;
  slug: string;
  parentCategoryId: number | null;
}

export function createAdminCategory(request: CategoryUpsertRequest): Promise<CategoryDto> {
  return apiFetch<CategoryDto>('/admin/categories', { method: 'POST', body: JSON.stringify(request) });
}

export function updateAdminCategory(id: number, request: CategoryUpsertRequest): Promise<CategoryDto> {
  return apiFetch<CategoryDto>(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(request) });
}

export function deleteAdminCategory(id: number): Promise<void> {
  return apiFetch<void>(`/admin/categories/${id}`, { method: 'DELETE' });
}

/** 0=Percentage, 1=FixedAmount - matches backend PromoCodeDiscountType. */
export type ApiPromoCodeDiscountType = 0 | 1;

export interface PromoCodeDto {
  id: number;
  code: string;
  discountType: ApiPromoCodeDiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
}

export interface PromoCodeUpsertRequest {
  code: string;
  discountType: ApiPromoCodeDiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  validFrom: string;
  validUntil: string;
  usageLimit: number | null;
  isActive: boolean;
}

export interface PromoCodeApplicationDto {
  promoCodeId: number;
  code: string;
  discountType: ApiPromoCodeDiscountType;
  discountValue: number;
  discountAmount: number;
  finalTotal: number;
}

export function validatePromoCode(code: string, orderSubtotal: number): Promise<PromoCodeApplicationDto> {
  return apiFetch<PromoCodeApplicationDto>('/promo-codes/validate', {
    method: 'POST',
    body: JSON.stringify({ code, orderSubtotal }),
  });
}

export function fetchAdminPromoCodes(page = 1, pageSize = 10): Promise<PagedResult<PromoCodeDto>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiFetch<PagedResult<PromoCodeDto>>(`/admin/promo-codes?${params.toString()}`);
}

export function createAdminPromoCode(request: PromoCodeUpsertRequest): Promise<PromoCodeDto> {
  return apiFetch<PromoCodeDto>('/admin/promo-codes', { method: 'POST', body: JSON.stringify(request) });
}

export function updateAdminPromoCode(id: number, request: PromoCodeUpsertRequest): Promise<PromoCodeDto> {
  return apiFetch<PromoCodeDto>(`/admin/promo-codes/${id}`, { method: 'PUT', body: JSON.stringify(request) });
}

export function deleteAdminPromoCode(id: number): Promise<void> {
  return apiFetch<void>(`/admin/promo-codes/${id}`, { method: 'DELETE' });
}

export interface PromoBannerDto {
  id: number;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PromoBannerUpsertRequest {
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export function fetchActivePromoBanners(): Promise<PromoBannerDto[]> {
  return apiFetch<PromoBannerDto[]>('/promo-banners/active');
}

export function fetchAdminPromoBanners(): Promise<PromoBannerDto[]> {
  return apiFetch<PromoBannerDto[]>('/admin/promo-banners');
}

export function createAdminPromoBanner(request: PromoBannerUpsertRequest): Promise<PromoBannerDto> {
  return apiFetch<PromoBannerDto>('/admin/promo-banners', { method: 'POST', body: JSON.stringify(request) });
}

export function updateAdminPromoBanner(id: number, request: PromoBannerUpsertRequest): Promise<PromoBannerDto> {
  return apiFetch<PromoBannerDto>(`/admin/promo-banners/${id}`, { method: 'PUT', body: JSON.stringify(request) });
}

export function deleteAdminPromoBanner(id: number): Promise<void> {
  return apiFetch<void>(`/admin/promo-banners/${id}`, { method: 'DELETE' });
}

export async function uploadAdminPromoBannerImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<string>('/admin/products/images', { method: 'POST', body: formData });
}
