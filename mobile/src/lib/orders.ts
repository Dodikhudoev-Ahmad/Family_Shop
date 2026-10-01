import type { ApiOrderStatus } from './api/types';

export type OrderStatusSlug = 'created' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

/** Status -> slug (colour) and translation key, same labels as the website's StatusBadge. */
export const ORDER_STATUS_INFO = {
  0: { labelKey: 'orders.statusCreated', slug: 'created' },
  1: { labelKey: 'orders.statusProcessing', slug: 'processing' },
  2: { labelKey: 'orders.statusShipped', slug: 'shipped' },
  3: { labelKey: 'orders.statusDelivered', slug: 'delivered' },
  4: { labelKey: 'orders.statusCancelled', slug: 'cancelled' },
} as const satisfies Record<ApiOrderStatus, { labelKey: string; slug: OrderStatusSlug }>;

/** "FS-12" - the order number customers see. */
export function orderNumber(id: number): string {
  return `FS-${id}`;
}

export { formatReviewDate as formatOrderDate } from './catalog/homeSections';
