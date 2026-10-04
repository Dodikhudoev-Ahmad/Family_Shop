import type { ApiGender, ApiResponse, CategoryDto, PagedResult, ProductDto, ProductSortBy } from '../types/api';
import { getAccessToken, setAccessToken } from './authToken';
import i18n from '../i18n';

import { API_BASE_URL } from './config';

export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable failure kind from the API envelope ('out_of_stock', 'conflict', ...). */
  readonly code?: string;
  readonly meta?: Record<string, unknown>;

  constructor(message: string, details: { status?: number; code?: string; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status ?? 0;
    this.code = details.code;
    this.meta = details.meta;
  }
}

// The refresh cookie is SameSite=None, so the browser attaches it to requests started by any page.
// Calls that act on it carry this custom header: it makes the browser run a CORS preflight, which only
// this app's origin passes, and the API rejects cookie requests without it (CSRF defence).
const COOKIE_REQUEST_HEADERS = { 'X-Requested-With': 'fetch' } as const;

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
    throw new ApiError(i18n.t('errors.connect'));
  }
}

// Refresh token lives in an httpOnly cookie, so this call carries no body - the browser
// sends the cookie automatically because of credentials: 'include'. The server rotates the cookie on
// every use, so two refreshes racing with the same cookie would fail the second one: every caller
// (page-load restore, a request that met a 401, a double-mounted effect) shares ONE in-flight request.
//  - ok:          a new access token was issued (already stored);
//  - rejected:    the server refused (401/403) - the session is over;
//  - unavailable: network, 429, 5xx or an unreadable answer - the session may be fine, so it is kept.
type RefreshOutcome =
  | { outcome: 'ok'; data: AuthResponseDto }
  | { outcome: 'rejected' }
  | { outcome: 'unavailable' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function doRefresh(): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: COOKIE_REQUEST_HEADERS,
    });
  } catch {
    return { outcome: 'unavailable' };
  }

  if (res.status === 401 || res.status === 403) return { outcome: 'rejected' };
  if (!res.ok) return { outcome: 'unavailable' };

  try {
    const json = (await res.json()) as ApiResponse<AuthResponseDto>;
    if (!json.success) return { outcome: 'unavailable' };
    setAccessToken(json.data.accessToken);
    return { outcome: 'ok', data: json.data };
  } catch {
    return { outcome: 'unavailable' };
  }
}

function refreshSession(): Promise<RefreshOutcome> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  // The rate limiter rejects requests before they reach our controllers, so a 429 body
  // isn't our JSON envelope - handle it separately with a message people can act on.
  if (res.status === 429) {
    throw new ApiError(i18n.t('errors.tooMany'));
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(i18n.t('errors.server', { status: res.status }));
  }

  if (!json.success) {
    throw new ApiError(json.errors.join('; ') || i18n.t('errors.failed'), {
      status: res.status,
      code: json.code,
      meta: json.meta,
    });
  }

  return json.data;
}

/** Fetches an endpoint behind the standard ApiResponse envelope. On 401 (expired access token) it refreshes
 *  the session once (shared with every other caller) and retries the request once - never a loop. The user is
 *  signed out only when the server rejects the refresh; if the service is merely unreachable the token is
 *  kept and the request fails with a connection error. */
async function apiFetch<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const res = await rawFetch(path, options);

  if (res.status === 401 && allowRefresh) {
    const result = await refreshSession();
    if (result.outcome === 'ok') {
      return apiFetch<T>(path, options, false);
    }
    if (result.outcome === 'unavailable') {
      throw new ApiError(i18n.t('errors.connect'));
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
  productType?: string;
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
  if (query.productType !== undefined) params.set('productType', query.productType);
  return params;
}

const FETCH_ALL_PAGE_SIZE = 200;

/** Загружает весь каталог без пагинации (используется контекстами вне страницы каталога).
 * Постранично, пока сервер не скажет hasMore: false — один запрос на 200 штук молча обрезал
 * бы каталог, как только он перерастёт этот размер. */
export async function fetchProducts(query: ProductQuery = {}): Promise<ProductDto[]> {
  const items: ProductDto[] = [];
  let page = 1;
  while (true) {
    const params = buildProductParams({ ...query, page, pageSize: FETCH_ALL_PAGE_SIZE });
    const result = await apiFetch<PagedResult<ProductDto>>(`/products?${params.toString()}`);
    items.push(...result.items);
    if (!result.hasMore) break;
    page += 1;
  }
  return items;
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

/** Attempts to restore a session from the httpOnly refresh cookie (e.g. on page load). Null means the server
 *  says there is no session; an unreachable service throws, so the caller keeps its sign-in hint. */
export async function silentRefresh(): Promise<AuthResponseDto | null> {
  const result = await refreshSession();
  if (result.outcome === 'ok') return result.data;
  if (result.outcome === 'rejected') return null;
  throw new ApiError(i18n.t('errors.connect'));
}

export async function logoutRequest(): Promise<void> {
  await rawFetch('/auth/logout', { method: 'POST', headers: COOKIE_REQUEST_HEADERS });
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
  contactName?: string;
  contactPhone: string;
  deliveryMethod: ApiDeliveryMethod;
  address?: string;
  promoCode?: string;
}

export function createOrder(request: CreateOrderRequest, idempotencyKey?: string): Promise<OrderDto> {
  return apiFetch<OrderDto>('/orders', {
    method: 'POST',
    body: JSON.stringify(request),
    // Lets the server recognise a repeated request (double click, retry after a lost answer) and not create a second order.
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
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
  /** Orders delivered today (the card "Доставлено сегодня"; the field kept its old name). */
  ordersToday: number;
  /** Orders placed today, not cancelled (the card "Новых сегодня"); absent from older servers. */
  newToday?: number;
  revenueToday: number;
  newOrdersCount: number;
  totalOrders: number;
  /** The shop's IANA time zone ("today" and the date filters follow it); absent from older servers. */
  storeTimeZone?: string | null;
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

// ---- Finance (admin only): money ledger, expenses, Excel export. Amounts are whole tenge. ----

export type FinancePeriod = 'today' | 'week' | 'month' | 'custom';
export type FinanceEntryKind = 'Income' | 'Reversal' | 'Expense';
export type ExpenseCategory = 'Purchase' | 'Delivery' | 'Other';

export interface FinanceSummaryDto {
  period: string;
  /** Shop calendar days, yyyy-MM-dd. */
  dateFrom: string;
  dateTo: string;
  income: number;
  reversals: number;
  expenses: number;
  balance: number;
  incomeCount: number;
  expenseCount: number;
  storeTimeZone: string;
}

export interface FinanceMonthDto {
  /** yyyy-MM in the shop's calendar. */
  month: string;
  income: number;
  reversals: number;
  expenses: number;
  balance: number;
}

export interface FinanceChartDto {
  storeTimeZone: string;
  months: FinanceMonthDto[];
}

/** Amount is always positive; the kind gives the sign (an income adds, a reversal and an expense subtract). */
export interface FinanceEntryDto {
  kind: FinanceEntryKind;
  id: number;
  date: string;
  amount: number;
  orderId: number | null;
  category: ExpenseCategory | null;
  comment: string | null;
  author: string | null;
  /** A soft-deleted expense: kept for the record, counted nowhere. */
  isDeleted: boolean;
  deletedAt: string | null;
}

export interface FinanceJournalQuery {
  kind?: FinanceEntryKind;
  dateFrom?: string;
  dateTo?: string;
  /** Also list deleted expenses (marked); off by default. */
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateExpenseRequest {
  category: ExpenseCategory;
  amount: number;
  /** Shop calendar day, yyyy-MM-dd. */
  date: string;
  comment?: string;
}

export function fetchFinanceSummary(period: FinancePeriod, dateFrom?: string, dateTo?: string): Promise<FinanceSummaryDto> {
  const params = new URLSearchParams({ period });
  if (period === 'custom') {
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
  }
  return apiFetch<FinanceSummaryDto>(`/admin/finance/summary?${params}`);
}

export function fetchFinanceChart(): Promise<FinanceChartDto> {
  return apiFetch<FinanceChartDto>('/admin/finance/chart');
}

export function fetchFinanceJournal(query: FinanceJournalQuery = {}): Promise<PagedResult<FinanceEntryDto>> {
  const params = new URLSearchParams();
  if (query.kind !== undefined) params.set('kind', query.kind);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.includeDeleted) params.set('includeDeleted', 'true');
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiFetch<PagedResult<FinanceEntryDto>>(`/admin/finance/journal${qs ? `?${qs}` : ''}`);
}

export function createExpense(request: CreateExpenseRequest): Promise<FinanceEntryDto> {
  return apiFetch<FinanceEntryDto>('/admin/finance/expenses', { method: 'POST', body: JSON.stringify(request) });
}

/** Soft-deletes an expense (a repeat succeeds and changes nothing). Resolves with the expense, now marked deleted. */
export function deleteExpense(id: number): Promise<FinanceEntryDto> {
  return apiFetch<FinanceEntryDto>(`/admin/finance/expenses/${id}`, { method: 'DELETE' });
}

/** The Excel file for a period (shop calendar days). The file name is built here: a cross-origin page can't read Content-Disposition. */
export async function downloadFinanceExport(dateFrom: string, dateTo: string): Promise<{ blob: Blob; fileName: string }> {
  const path = `/admin/finance/export?${new URLSearchParams({ dateFrom, dateTo })}`;
  let res = await rawFetch(path);
  if (res.status === 401) {
    const result = await refreshSession();
    if (result.outcome === 'ok') {
      res = await rawFetch(path);
    } else if (result.outcome === 'unavailable') {
      throw new ApiError(i18n.t('errors.connect'));
    } else {
      setAccessToken(null);
    }
  }
  if (!res.ok) {
    return parseEnvelope<never>(res); // an error envelope (400 too many rows, 429, ...) throws an ApiError
  }
  return { blob: await res.blob(), fileName: `finance_${dateFrom}_${dateTo}.xlsx` };
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
  /** What the product is; decides its size grid. */
  productType: string;
  /** The sizes it is sold in; null for a type without sizes (the server also stores null for the whole grid). */
  availableSizes: string[] | null;
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
  hasSizes: boolean;
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

export interface PromoBannerUpsertRequest {
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  placement: ApiPromoBannerPlacement;
}

export function fetchActivePromoBanners(placement: ApiPromoBannerPlacement): Promise<PromoBannerDto[]> {
  return apiFetch<PromoBannerDto[]>(`/promo-banners/active?placement=${placement}`);
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
