import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { useProducts } from '../context/ProductsContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Button } from '../components/Button/Button';
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

  return (
    <div className="container account">
      <div className="account__header">
        <div>
          <h1>Личный кабинет</h1>
          <p className="account__greeting">Здравствуйте, {user.name}</p>
        </div>
        <Button variant="ghost" onClick={logout}>
          Выйти
        </Button>
      </div>

      <OrderHistory />
      <FavoritesSection />
    </div>
  );
}

const STATUS_INFO: Record<ApiOrderStatus, { label: string; slug: string }> = {
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
      {!error && orders !== null && orders.length === 0 && <p className="account__empty">Заказов пока нет.</p>}
      {orders !== null && orders.length > 0 && (
        <div className="order-list">
          {orders.map((order) => {
            const status = STATUS_INFO[order.status];
            return (
              <div key={order.id} className="order-card">
                <div className="order-card__top">
                  <span className="order-card__id">FS-{order.id}</span>
                  <span className={`order-status order-status--${status.slug}`}>{status.label}</span>
                </div>
                <div className="order-card__meta">
                  <span>{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
                  <span>{formatPrice(order.totalPrice)}</span>
                </div>
                <div className="order-card__items">
                  {order.items.map((item) => (
                    <img
                      key={item.productId}
                      src={item.productImage ?? undefined}
                      alt={item.productName}
                      className="order-card__thumb"
                    />
                  ))}
                </div>
              </div>
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
