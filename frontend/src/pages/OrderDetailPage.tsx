import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import { ApiError, fetchOrders, type OrderDto } from '../lib/api';
import { STATUS_INFO } from './AccountPage';
import './AccountPage.css';

export function OrderDetailPage() {
  const { id } = useParams();
  const { user, isLoading } = useAuth();
  const [order, setOrder] = useState<OrderDto | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchOrders()
      .then((orders) => {
        if (!cancelled) setOrder(orders.find((o) => String(o.id) === id) ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не удалось загрузить заказ.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  if (isLoading) return <div className="container order-detail" />;
  if (!user) return <Navigate to="/login" replace />;

  const back = (
    <Link to="/account" className="order-detail__back">
      ← Личный кабинет
    </Link>
  );

  if (error || order === null) {
    return (
      <div className="container order-detail">
        {back}
        <p className="account__empty">{error ?? 'Заказ не найден.'}</p>
      </div>
    );
  }
  if (order === undefined) {
    return (
      <div className="container order-detail">
        {back}
        <p className="account__empty">Загрузка...</p>
      </div>
    );
  }

  const status = STATUS_INFO[order.status];

  return (
    <div className="container order-detail">
      {back}
      <div className="order-detail__head">
        <div>
          <h1>Заказ FS-{order.id}</h1>
          <span className="order-detail__date">{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
        </div>
        <span className={`status-badge order-status status-badge--${status.slug}`}>{status.label}</span>
      </div>

      <div className="order-detail__info">
        <div>{order.contactName}, {order.contactPhone}</div>
        <div>{order.deliveryMethod === 0 ? `${order.city}, ${order.address}` : 'Самовывоз из пункта выдачи'}</div>
        <div>Оплата при получении</div>
      </div>

      <div className="order-detail__info">
        {order.items.map((item, i) => (
          <div key={`${item.productId}-${i}`} className="order-detail__row">
            <img src={item.productImage ?? undefined} alt={item.productName} />
            <div className="order-detail__row-info">
              <span>{item.productName}</span>
              <small>{item.size ? `${item.size} · ` : ''}{item.quantity} шт.</small>
            </div>
            <span>{formatPrice(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.promoCode && (
          <div className="order-detail__row">
            <span>Промокод {order.promoCode}</span>
            <span style={{ marginLeft: 'auto' }}>−{formatPrice(order.discountAmount)}</span>
          </div>
        )}
        <div className="order-detail__total">
          <span>Итого</span>
          <strong>{formatPrice(order.totalPrice)}</strong>
        </div>
      </div>
    </div>
  );
}
