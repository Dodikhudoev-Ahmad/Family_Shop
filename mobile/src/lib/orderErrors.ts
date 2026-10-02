import type { TFunction } from 'i18next';
import { ApiError } from './api/errors';

export interface OutOfStockInfo {
  productId: number | null;
  productName: string;
  available: number;
}

/** The 409 "out_of_stock" answer of POST /orders (another order took the stock, or the cart asked for too much). */
export function outOfStockInfo(err: unknown): OutOfStockInfo | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== 'out_of_stock') return null;
  const meta = err.meta ?? {};
  return {
    productId: typeof meta.productId === 'number' ? meta.productId : null,
    productName: typeof meta.productName === 'string' ? meta.productName : '',
    available: typeof meta.available === 'number' ? Math.max(0, meta.available) : 0,
  };
}

export interface SizeUnavailableInfo {
  productName: string;
  size: string | null;
}

/** The 409 "size_unavailable" answer of POST /orders: the size isn't (or is no longer) sold for that product. */
export function sizeUnavailableInfo(err: unknown): SizeUnavailableInfo | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== 'size_unavailable') return null;
  const meta = err.meta ?? {};
  return {
    productName: typeof meta.productName === 'string' ? meta.productName : '',
    size: typeof meta.size === 'string' && meta.size ? meta.size : null,
  };
}

export function sizeUnavailableMessage(info: SizeUnavailableInfo, t: TFunction): string {
  return info.size
    ? t('checkout.sizeUnavailable', { name: info.productName, size: info.size })
    : t('checkout.sizeRequired', { name: info.productName });
}

/** The 409 "conflict" answer of an order status change (someone else changed the order first). */
export function isOrderConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === 'conflict';
}

export function outOfStockMessage(info: OutOfStockInfo, t: TFunction): string {
  return info.available > 0
    ? t('checkout.outOfStock', { name: info.productName, count: info.available })
    : t('checkout.outOfStockNone', { name: info.productName });
}
