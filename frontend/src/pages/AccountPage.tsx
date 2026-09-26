import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { useProducts } from '../context/ProductsContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Button } from '../components/Button/Button';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { formatPrice } from '../utils/formatPrice';
import { ApiError, fetchOrders, type ApiOrderStatus, type OrderDto } from '../lib/api';
import './AccountPage.css';

export function AccountPage() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <div className="container account" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'Admin') {
    return <Navigate to="/admin/orders" replace />;
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="container account">
      <div className="account__profile">
        <div className="account__avatar" aria-hidden="true">{initial}</div>
        <div className="account__profile-text">
          <p className="account__eyebrow">Личный кабинет</p>
          <h1 className="account__greeting">Здравствуйте, {user.name}</h1>
        </div>
        <button type="button" className="account__logout" onClick={logout}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />
          </svg>
          Выйти
        </button>
      </div>

      <OrderHistory />
      <hr className="account__divider" />
      <FavoritesSection />
    </div>
  );
}

export const STATUS_INFO: Record<ApiOrderStatus, { label: string; slug: string }> = {
  0: { label: 'Оформлен', slug: 'created' },
  1: { label: 'В обработке', slug: 'processing' },
  2: { label: 'В пути', slug: 'shipped' },
  3: { label: 'Доставлен', slug: 'delivered' },
  4: { label: 'Отменён', slug: 'cancelled' },
};

function OrderHistory() {
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить историю заказов.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="account__section">
      <h3 className="account__section-title">Мои заказы</h3>
      {error && <p className="account__empty">{error}</p>}
      {!error && orders === null && <p className="account__empty">Загрузка...</p>}
      {!error && orders !== null && orders.length === 0 && (
        <div className="account__empty-state">
          <span className="account__empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />
            </svg>
          </span>
          <p className="account__empty-title">Пока нет заказов</p>
          <p className="account__empty">Оформленные заказы появятся здесь.</p>
          <Link to="/catalog">
            <Button variant="primary">Перейти к покупкам</Button>
          </Link>
        </div>
      )}
      {orders !== null && orders.length > 0 && (
        <div className="order-list">
          {orders.map((order) => {
            const status = STATUS_INFO[order.status];
            return (
              <Link key={order.id} to={`/account/orders/${order.id}`} className="order-card">
                <div className="order-card__top">
                  <span className="order-card__id">FS-{order.id}</span>
                  <span className={`status-badge order-status status-badge--${status.slug}`}>{status.label}</span>
                </div>
                <div className="order-card__meta">
                  <span>{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
                  <span className="order-card__total">{formatPrice(order.totalPrice)}</span>
                </div>
                <div className="order-card__bottom">
                  <div className="order-card__items">
                    {order.items.slice(0, 5).map((item, i) => (
                      <FadeImage
                        key={`${item.productId}-${i}`}
                        src={item.productImage ?? undefined}
                        alt={item.productName}
                        className="order-card__thumb"
                      />
                    ))}
                    {order.items.length > 5 && <span className="order-card__more">+{order.items.length - 5}</span>}
                  </div>
                  <span className="order-card__chevron" aria-hidden="true">›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FavoritesSection() {
  const { favoriteIds } = useFavorites();
  const { products } = useProducts();
  const favoriteProducts = products.filter((p) => favoriteIds.includes(p.id));

  return (
    <section className="account__section">
      <h3 className="account__section-title">Избранное</h3>
      {favoriteProducts.length === 0 ? (
        <p className="account__empty">Пока пусто. Добавляйте товары в избранное значком сердца.</p>
      ) : (
        <div className="account__favorites-grid">
          {favoriteProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
