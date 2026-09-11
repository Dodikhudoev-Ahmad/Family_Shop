import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { StatusBadge, ORDER_STATUS_INFO, ALLOWED_NEXT_STATUSES } from '../../components/StatusBadge/StatusBadge';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatPrice } from '../../utils/formatPrice';
import {
  ApiError,
  fetchAdminOrders,
  fetchAdminOrderStats,
  updateAdminOrderStatus,
  type AdminOrderDto,
  type ApiOrderStatus,
  type OrderStatsDto,
} from '../../lib/api';
import './AdminOrdersPage.css';

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

type StatusFilter = ApiOrderStatus | 'all';
type ViewMode = 'table' | 'cards';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 0, label: 'Новые' },
  { value: 1, label: 'В обработке' },
  { value: 2, label: 'Доставляются' },
  { value: 3, label: 'Завершённые' },
  { value: 4, label: 'Отменённые' },
];

const DELIVERY_LABEL: Record<0 | 1, string> = { 0: 'Курьером', 1: 'Самовывоз' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AdminOrdersPage() {
  const { showToast } = useToast();

  const [stats, setStats] = useState<OrderStatsDto | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'cards' : 'table'));
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState<AdminOrderDto[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const requestIdRef = useRef(0);

  useLockBodyScroll(expandedId !== null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);

  const loadStats = () => {
    fetchAdminOrderStats()
      .then((data) => {
        setStats(data);
        setStatsError(false);
      })
      .catch(() => setStatsError(true));
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    fetchAdminOrders({
      status: statusFilter === 'all' ? undefined : statusFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setOrders(result.items);
        setTotalCount(result.totalCount);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заказы.');
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsLoading(false);
      });
  }, [statusFilter, dateFrom, dateTo, debouncedSearch, page]);

  const handleStatusChange = (order: AdminOrderDto, newStatus: ApiOrderStatus) => {
    const previousStatus = order.status;
    setPendingId(order.id);
    setOrders((prev) => prev && prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));

    updateAdminOrderStatus(order.id, newStatus)
      .then((updated) => {
        setOrders((prev) => prev && prev.map((o) => (o.id === order.id ? updated : o)));
        showToast(`Заказ FS-${order.id}: статус изменён на «${ORDER_STATUS_INFO[newStatus].label}»`);
        loadStats();
      })
      .catch((err: unknown) => {
        setOrders((prev) => prev && prev.map((o) => (o.id === order.id ? { ...o, status: previousStatus } : o)));
        showToast(err instanceof ApiError ? err.message : 'Не удалось изменить статус заказа.', 'error');
      })
      .finally(() => setPendingId(null));
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const expandedOrder = orders?.find((o) => o.id === expandedId) ?? null;
  const hasFilters = statusFilter !== 'all' || dateFrom !== '' || dateTo !== '' || debouncedSearch !== '';

  return (
    <AdminLayout>
      <div className="admin-orders">
        <header className="admin-orders__header">
          <div>
            <h1>Заказы</h1>
            <p>Управление заказами клиентов Family Shop</p>
          </div>
        </header>

        <StatsRow stats={stats} error={statsError} />

        <div className="admin-orders__toolbar">
          <div className="admin-orders__tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={String(tab.value)}
                className={`admin-orders__tab ${statusFilter === tab.value ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-orders__filters">
            <input
              type="search"
              className="admin-orders__search"
              placeholder="Поиск по номеру, имени, телефону"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <input
              type="date"
              className="admin-orders__date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Дата от"
            />
            <span className="admin-orders__date-sep">—</span>
            <input
              type="date"
              className="admin-orders__date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Дата до"
            />
            <div className="admin-orders__view-toggle">
              <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')} aria-label="Табличный вид">
                <TableIcon />
              </button>
              <button className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')} aria-label="Карточный вид">
                <GridIcon />
              </button>
            </div>
          </div>
        </div>

        {error && <p className="admin-page-error">{error}</p>}

        {!error && isLoading && (view === 'table' ? <TableSkeleton /> : <CardsSkeleton />)}

        {!error && !isLoading && orders !== null && orders.length === 0 && (
          <EmptyState hasFilters={hasFilters} />
        )}

        {!error && !isLoading && orders !== null && orders.length > 0 && (
          <>
            {view === 'table' ? (
              <OrdersTable
                orders={orders}
                pendingId={pendingId}
                onStatusChange={handleStatusChange}
                onExpand={setExpandedId}
              />
            ) : (
              <OrdersCards
                orders={orders}
                pendingId={pendingId}
                onStatusChange={handleStatusChange}
                onExpand={setExpandedId}
              />
            )}

            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Назад
              </button>
              <span>
                Страница {page} из {totalPages} · {totalCount} заказ(ов)
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Далее
              </button>
            </div>
          </>
        )}
      </div>

      <OrderDrawer order={expandedOrder} onClose={() => setExpandedId(null)} />
    </AdminLayout>
  );
}

function StatsRow({ stats, error }: { stats: OrderStatsDto | null; error: boolean }) {
  if (error) {
    return <p className="admin-page-error">Не удалось загрузить метрики.</p>;
  }

  const cards = [
    { label: 'Заказов сегодня', value: stats ? String(stats.ordersToday) : null },
    { label: 'Выручка сегодня', value: stats ? formatPrice(stats.revenueToday) : null },
    { label: 'Новых заказов', value: stats ? String(stats.newOrdersCount) : null },
    { label: 'Всего заказов', value: stats ? String(stats.totalOrders) : null },
  ];

  return (
    <div className="admin-stats">
      {cards.map((card, i) => (
        <div className="admin-stats__card" style={{ animationDelay: `${i * 70}ms` }} key={card.label}>
          <span className="admin-stats__label">{card.label}</span>
          {card.value === null ? (
            <span className="skeleton admin-stats__value-skeleton" />
          ) : (
            <span className="admin-stats__value">{card.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OrdersTable({
  orders,
  pendingId,
  onStatusChange,
  onExpand,
}: {
  orders: AdminOrderDto[];
  pendingId: number | null;
  onStatusChange: (order: AdminOrderDto, status: ApiOrderStatus) => void;
  onExpand: (id: number) => void;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата</th>
            <th>Клиент</th>
            <th>Товаров</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className={pendingId === order.id ? 'is-updating' : ''}>
              <td className="admin-table__id">FS-{order.id}</td>
              <td>{formatDate(order.createdAt)}</td>
              <td>
                <div className="admin-table__customer">{order.contactName}</div>
                <div className="admin-table__phone">{order.contactPhone}</div>
              </td>
              <td>{order.itemsCount}</td>
              <td className="admin-table__total">{formatPrice(order.totalPrice)}</td>
              <td>
                <StatusControl order={order} disabled={pendingId === order.id} onChange={onStatusChange} />
              </td>
              <td>
                <button className="admin-table__expand" onClick={() => onExpand(order.id)}>
                  Детали
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersCards({
  orders,
  pendingId,
  onStatusChange,
  onExpand,
}: {
  orders: AdminOrderDto[];
  pendingId: number | null;
  onStatusChange: (order: AdminOrderDto, status: ApiOrderStatus) => void;
  onExpand: (id: number) => void;
}) {
  return (
    <div className="admin-cards">
      {orders.map((order) => (
        <div key={order.id} className={`admin-order-card ${pendingId === order.id ? 'is-updating' : ''}`}>
          <div className="admin-order-card__top">
            <span className="admin-table__id">FS-{order.id}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="admin-order-card__customer">{order.contactName}</div>
          <div className="admin-order-card__phone">{order.contactPhone}</div>
          <div className="admin-order-card__meta">
            <span>{formatDate(order.createdAt)}</span>
            <span>{order.itemsCount} тов.</span>
            <span className="admin-order-card__total">{formatPrice(order.totalPrice)}</span>
          </div>
          <div className="admin-order-card__actions">
            <StatusControl order={order} disabled={pendingId === order.id} onChange={onStatusChange} />
            <button className="admin-table__expand" onClick={() => onExpand(order.id)}>
              Детали
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusControl({
  order,
  disabled,
  onChange,
}: {
  order: AdminOrderDto;
  disabled: boolean;
  onChange: (order: AdminOrderDto, status: ApiOrderStatus) => void;
}) {
  const options = ALLOWED_NEXT_STATUSES[order.status];

  return (
    <div className={`status-control status-control--${ORDER_STATUS_INFO[order.status].slug}`}>
      <StatusBadge status={order.status} />
      {options.length > 0 && (
        <select
          className="status-control__select"
          value=""
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value) as ApiOrderStatus;
            if (!Number.isNaN(next)) onChange(order, next);
          }}
          aria-label={`Изменить статус заказа FS-${order.id}`}
        >
          <option value="" disabled>
            Изменить...
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_INFO[status].label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function OrderDrawer({ order, onClose }: { order: AdminOrderDto | null; onClose: () => void }) {
  return (
    <>
      <div className={`admin-drawer__backdrop ${order ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`admin-drawer ${order ? 'is-open' : ''}`} aria-hidden={!order}>
        {order && (
          <>
            <div className="admin-drawer__header">
              <div>
                <h2>Заказ FS-{order.id}</h2>
                <span className="admin-drawer__date">{formatDateTime(order.createdAt)}</span>
              </div>
              <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть">
                &times;
              </button>
            </div>

            <div className="admin-drawer__status">
              <StatusBadge status={order.status} />
            </div>

            <section className="admin-drawer__section">
              <h3>Клиент</h3>
              <p>{order.contactName}</p>
              <p>{order.contactPhone}</p>
            </section>

            <section className="admin-drawer__section">
              <h3>Доставка</h3>
              <p>{DELIVERY_LABEL[order.deliveryMethod]}</p>
              {order.city && <p>{order.city}</p>}
              {order.address && <p>{order.address}</p>}
            </section>

            <section className="admin-drawer__section">
              <h3>Состав заказа</h3>
              <ul className="admin-drawer__items">
                {order.items.map((item, i) => (
                  <li key={`${item.productId}-${i}`} className="admin-drawer__item">
                    {item.productImage && <img src={item.productImage} alt={item.productName} />}
                    <div>
                      <div className="admin-drawer__item-name">{item.productName}</div>
                      <div className="admin-drawer__item-meta">
                        {item.size && <span>Размер {item.size} · </span>}
                        {item.quantity} × {formatPrice(item.price)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="admin-drawer__total">
              <span>Итого</span>
              <span>{formatPrice(order.totalPrice)}</span>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="admin-empty">
      <div className="admin-empty__icon">
        <OrdersEmptyIcon />
      </div>
      <h3>{hasFilters ? 'По этим фильтрам заказов не найдено' : 'Заказов пока нет'}</h3>
      <p>{hasFilters ? 'Попробуйте изменить период, статус или поисковый запрос.' : 'Новые заказы клиентов появятся здесь.'}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата</th>
            <th>Клиент</th>
            <th>Товаров</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j}>
                  <span className="skeleton admin-skeleton-cell" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-order-card">
          <span className="skeleton" style={{ height: 18, width: '60%', marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
          <span className="skeleton" style={{ height: 14, width: '40%' }} />
        </div>
      ))}
    </div>
  );
}

function TableIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 7h12M6 3v10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function OrdersEmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="8" y="12" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 12v-2a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 19h12M14 24h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
