import type { ApiOrderStatus } from '../../lib/api';
import './StatusBadge.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export const ORDER_STATUS_INFO = {
  0: { labelKey: 'orders.statusCreated', slug: 'created' },
  1: { labelKey: 'orders.statusProcessing', slug: 'processing' },
  2: { labelKey: 'orders.statusShipped', slug: 'shipped' },
  3: { labelKey: 'orders.statusDelivered', slug: 'delivered' },
  4: { labelKey: 'orders.statusCancelled', slug: 'cancelled' },
} as const satisfies Record<ApiOrderStatus, { labelKey: string; slug: string }>;

/** Status text in the current language, for places outside React components (e.g. toasts). */
export function orderStatusLabel(status: ApiOrderStatus): string {
  return i18n.t(ORDER_STATUS_INFO[status].labelKey);
}

/** Status transitions the admin panel allows initiating from a given status - mirrors the backend's AllowedTransitions map. */
export const ALLOWED_NEXT_STATUSES: Record<ApiOrderStatus, ApiOrderStatus[]> = {
  0: [1, 4],
  1: [2, 4],
  2: [3, 4],
  3: [],
  4: [],
};

export function StatusBadge({ status }: { status: ApiOrderStatus }) {
  const { t } = useTranslation();
  const info = ORDER_STATUS_INFO[status];
  return <span className={`status-badge status-badge--${info.slug}`}>{t(info.labelKey)}</span>;
}
