import { api } from './client';
import type {
  CategoryDto,
  CreateOrderRequest,
  OrderDto,
  PagedResult,
  ProductDto,
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

export function fetchProduct(id: number): Promise<ProductDto> {
  return api.request<ProductDto>(`/products/${id}`);
}

export function createOrder(request: CreateOrderRequest): Promise<OrderDto> {
  return api.request<OrderDto>('/orders', { method: 'POST', body: request, auth: 'required' });
}

export function fetchOrders(): Promise<OrderDto[]> {
  return api.request<OrderDto[]>('/orders', { auth: 'required' });
}
