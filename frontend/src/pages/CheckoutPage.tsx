import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import { Button } from '../components/Button/Button';
import { ApiError, createOrder, type ApiDeliveryMethod } from '../lib/api';
import type { DeliveryDetails, DeliveryMethod } from '../types/order';
import './CheckoutPage.css';

type Step = 1 | 2;

const initialDetails: DeliveryDetails = {
  fullName: '',
  phone: '',
  city: '',
  address: '',
  method: 'courier',
};

const DELIVERY_METHOD_TO_API: Record<DeliveryMethod, ApiDeliveryMethod> = { courier: 0, pickup: 1 };

export function CheckoutPage() {
  const { lines, totalPrice, clearCart } = useCart();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<DeliveryDetails>(initialDetails);
  const [errors, setErrors] = useState<Partial<Record<keyof DeliveryDetails, string>>>({});
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isAuthLoading) {
    return <div className="container checkout" />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: '/checkout' }} replace />;
  }

  if (lines.length === 0 && !orderNumber) {
    return (
      <div className="container checkout__empty">
        <p>В корзине нет товаров для оформления.</p>
        <Link to="/">Перейти в каталог</Link>
      </div>
    );
  }

  const validateStep1 = () => {
    const next: typeof errors = {};
    if (!details.fullName.trim()) next.fullName = 'Укажите имя и фамилию';
    if (!/^[\d+()\s-]{7,}$/.test(details.phone)) next.phone = 'Некорректный номер телефона';
    if (details.method === 'courier') {
      if (!details.city.trim()) next.city = 'Укажите город';
      if (!details.address.trim()) next.address = 'Укажите адрес';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder({
        items: lines.map((line) => ({
          productId: Number(line.product.id),
          quantity: line.quantity,
          size: line.size,
        })),
        contactName: details.fullName,
        contactPhone: details.phone,
        deliveryMethod: DELIVERY_METHOD_TO_API[details.method],
        city: details.method === 'courier' ? details.city : undefined,
        address: details.method === 'courier' ? details.address : undefined,
      });
      clearCart();
      setOrderNumber(`FS-${order.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Не удалось оформить заказ. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderNumber) {
    return (
      <div className="container checkout-success">
        <div className="checkout-success__icon">✓</div>
        <h1>Заказ оформлен!</h1>
        <p>Номер вашего заказа</p>
        <span className="checkout-success__number">{orderNumber}</span>
        <p className="checkout-success__note">
          Мы свяжемся с вами для подтверждения. Оплата — при получении заказа.
        </p>
        <Link to="/">
          <Button variant="primary" size="lg">
            На главную
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container checkout">
      <div className="checkout__progress">
        <div className={`checkout__step ${step >= 1 ? 'is-active' : ''}`}>
          <span className="checkout__step-num">1</span> Доставка
        </div>
        <div className="checkout__progress-line">
          <div className="checkout__progress-fill" style={{ width: step === 2 ? '100%' : '0%' }} />
        </div>
        <div className={`checkout__step ${step >= 2 ? 'is-active' : ''}`}>
          <span className="checkout__step-num">2</span> Подтверждение
        </div>
      </div>

      {step === 1 ? (
        <form className="checkout__form" onSubmit={handleContinue}>
          <div className="checkout__field">
            <label htmlFor="fullName">Имя и фамилия</label>
            <input
              id="fullName"
              value={details.fullName}
              className={errors.fullName ? 'has-error' : ''}
              onChange={(e) => setDetails({ ...details, fullName: e.target.value })}
            />
            {errors.fullName && <span className="checkout__error">{errors.fullName}</span>}
          </div>

          <div className="checkout__field">
            <label htmlFor="phone">Телефон</label>
            <input
              id="phone"
              value={details.phone}
              className={errors.phone ? 'has-error' : ''}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              placeholder="+7 900 000-00-00"
            />
            {errors.phone && <span className="checkout__error">{errors.phone}</span>}
          </div>

          <div className="checkout__field">
            <label>Способ получения</label>
            <div className="delivery-options">
              {(['courier', 'pickup'] as DeliveryMethod[]).map((method) => (
                <button
                  type="button"
                  key={method}
                  className={`delivery-card ${details.method === method ? 'is-selected' : ''}`}
                  onClick={() => setDetails({ ...details, method })}
                >
                  <span className="delivery-card__title">{method === 'courier' ? 'Курьером' : 'Самовывоз'}</span>
                  <span className="delivery-card__desc">
                    {method === 'courier' ? 'Доставка по указанному адресу' : 'Из пункта выдачи, бесплатно'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {details.method === 'courier' && (
            <>
              <div className="checkout__field">
                <label htmlFor="city">Город</label>
                <input
                  id="city"
                  value={details.city}
                  className={errors.city ? 'has-error' : ''}
                  onChange={(e) => setDetails({ ...details, city: e.target.value })}
                />
                {errors.city && <span className="checkout__error">{errors.city}</span>}
              </div>
              <div className="checkout__field">
                <label htmlFor="address">Адрес</label>
                <input
                  id="address"
                  value={details.address}
                  className={errors.address ? 'has-error' : ''}
                  onChange={(e) => setDetails({ ...details, address: e.target.value })}
                />
                {errors.address && <span className="checkout__error">{errors.address}</span>}
              </div>
            </>
          )}

          <Button type="submit" variant="primary" size="lg" className="checkout__submit">
            Продолжить
          </Button>
        </form>
      ) : (
        <div className="checkout__summary">
          <div className="checkout__summary-block">
            <h4>Доставка</h4>
            <p>{details.fullName}, {details.phone}</p>
            <p>{details.method === 'courier' ? `${details.city}, ${details.address}` : 'Самовывоз из пункта выдачи'}</p>
          </div>

          <div className="checkout__summary-block">
            <h4>Способ оплаты</h4>
            <p>Оплата при получении</p>
          </div>

          <div className="checkout__summary-block">
            <h4>Состав заказа</h4>
            {lines.map((line) => (
              <div key={line.key} className="checkout__summary-line">
                <span>{line.product.name} · {line.size} × {line.quantity}</span>
                <span>{formatPrice((line.product.discountPrice ?? line.product.price) * line.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="checkout__summary-total">
            <span>Итого</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>

          {submitError && <span className="checkout__error checkout__submit-error">{submitError}</span>}

          <div className="checkout__summary-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={isSubmitting}
            >
              Назад
            </Button>
            <Button variant="primary" size="lg" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Оформляем...' : 'Подтвердить заказ'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
