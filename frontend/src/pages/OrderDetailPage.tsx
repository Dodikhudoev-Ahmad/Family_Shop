import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import { ApiError, fetchOrders, type OrderDto } from '../lib/api';
import { STATUS_INFO } from './AccountPage';
import './AccountPage.css';
import { useTranslation } from 'react-i18next';

export function OrderDetailPage() {
  const { t } = useTranslation();
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
        if (!cancelled) setError(err instanceof ApiError ? err.message : t('orders.loadError'));
      });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  if (isLoading) return <div className="container order-detail" />;
  if (!user) return <Navigate to="/login" replace />;

  const back = (
    <Link to="/account" className="order-detail__back">
      {t('orders.back')}
    </Link>
  );

  if (error || order === null) {
    return (
      <div className="container order-detail">
        {back}
        <p className="account__empty">{error ?? t('orders.notFound')}</p>
      </div>
    );
  }
  if (order === undefined) {
    return (
      <div className="container order-detail">
        {back}
        <p className="account__empty">{t('common.loading')}</p>
      </div>
    );
  }

  const status = STATUS_INFO[order.status];

  return (
    <div className="container order-detail">
      {back}
      <div className="order-detail__head">
        <div>
          <h1>{t('orders.title', { id: order.id })}</h1>
          <span className="order-detail__date">{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
        </div>
        <span className={`status-badge order-status status-badge--${status.slug}`}>{t(status.labelKey)}</span>
      </div>

      <div className="order-detail__info">
        <div>{order.contactName}, {order.contactPhone}</div>
        <div>{order.deliveryMethod === 0 ? [order.city, order.address].filter(Boolean).join(', ') : t('checkout.pickupAt')}</div>
        <div>{t('checkout.paymentValue')}</div>
      </div>

      <div className="order-detail__info">
        {order.items.map((item, i) => (
          <div key={`${item.productId}-${i}`} className="order-detail__row">
            <img src={item.productImage ?? undefined} alt={item.productName} />
            <div className="order-detail__row-info">
              <span>{item.productName}</span>
              <small>{item.size ? `${item.size} · ` : ''}{t('checkout.qty', { count: item.quantity })}</small>
            </div>
            <span>{formatPrice(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.promoCode && (
          <div className="order-detail__row">
            <span>{t('orders.promo', { code: order.promoCode })}</span>
            <span style={{ marginLeft: 'auto' }}>−{formatPrice(order.discountAmount)}</span>
          </div>
        )}
        <div className="order-detail__total">
          <span>{t('common.total')}</span>
          <strong>{formatPrice(order.totalPrice)}</strong>
        </div>
      </div>
    </div>
  );
}
