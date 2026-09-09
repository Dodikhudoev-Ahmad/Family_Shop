import type { ApiOrderStatus } from '../../lib/api';
import './StatusBadge.css';

export const ORDER_STATUS_INFO: Record<ApiOrderStatus, { label: string; slug: string }> = {
  0: { label: 'Новый', slug: 'created' },
  1: { label: 'В обработке', slug: 'processing' },
  2: { label: 'Доставляется', slug: 'shipped' },
  3: { label: 'Завершён', slug: 'delivered' },
  4: { label: 'Отменён', slug: 'cancelled' },
};

/** Status transitions the admin panel allows initiating from a given status - mirrors the backend's AllowedTransitions map. */
export const ALLOWED_NEXT_STATUSES: Record<ApiOrderStatus, ApiOrderStatus[]> = {
  0: [1, 4],
  1: [2, 4],
  2: [3],
  3: [],
  4: [],
};

export function StatusBadge({ status }: { status: ApiOrderStatus }) {
  const info = ORDER_STATUS_INFO[status];
  return <span className={`status-badge status-badge--${info.slug}`}>{info.label}</span>;
}
