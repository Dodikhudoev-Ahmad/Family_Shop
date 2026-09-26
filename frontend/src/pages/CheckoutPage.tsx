import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import { Button } from '../components/Button/Button';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { PromoCodeInput } from '../components/PromoCodeInput/PromoCodeInput';
import { ApiError, createOrder, type ApiDeliveryMethod } from '../lib/api';
import type { DeliveryDetails, DeliveryMethod } from '../types/order';
import './CheckoutPage.css';

type Step = 1 | 2;

const REDIRECT_DELAY_MS = 3500;

const TruckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </svg>
);

const WalletIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7a2 2 0 0 1 2-2h11v4" />
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <circle cx="16.5" cy="13.5" r="1.2" />
  </svg>
);

const BagIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

const initialDetails: DeliveryDetails = {
  phone: '',
  address: '',
  method: 'courier',
};

const DELIVERY_METHOD_TO_API: Record<DeliveryMethod, ApiDeliveryMethod> = { courier: 0, pickup: 1 };

const NATIONAL_PHONE_LENGTH = 10; // digits after the +7 country code

// Extracts the 10-digit national number. The displayed value already carries
// a literal "+7 (" prefix once formatted, so that prefix is stripped as text
// first - otherwise its "7" would get re-counted as a national digit on every
// keystroke. What's left is treated as the national number as typed, except
// when a full 11-digit number (with an explicit leading 7/8 trunk code, e.g.
// a pasted "87051234567") is pasted in one go - KZ mobile numbers already
// start with 7, so a bare length check is needed instead of always stripping
// the first digit.
function getNationalDigits(raw: string): string {
  const withoutPrefix = raw.startsWith('+7') ? raw.slice(2) : raw;
  let digits = withoutPrefix.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, NATIONAL_PHONE_LENGTH);
}

function formatPhoneInput(raw: string): string {
  const national = getNationalDigits(raw);
  if (!national) return '';
  let result = '+7';
  result += ` (${national.slice(0, 3)}`;
  if (national.length >= 3) result += ')';
  if (national.length > 3) result += ` ${national.slice(3, 6)}`;
  if (national.length > 6) result += `-${national.slice(6, 8)}`;
  if (national.length > 8) result += `-${national.slice(8, 10)}`;
  return result;
}

function phoneError(value: string): string | null {
  const national = getNationalDigits(value);
  if (!national) return 'Укажите номер телефона';
  if (national.length < NATIONAL_PHONE_LENGTH) return 'Введите номер полностью';
  return null;
}

function addressError(value: string): string | null {
  return value.trim() ? null : 'Укажите адрес';
}

export function CheckoutPage() {
  const { lines, totalPrice, finalTotal, promo, clearCart } = useCart();
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<DeliveryDetails>(initialDetails);
  const [touched, setTouched] = useState<Partial<Record<keyof DeliveryDetails, boolean>>>({});
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors = {
    phone: touched.phone ? phoneError(details.phone) : null,
    address: touched.address && details.method === 'courier' ? addressError(details.address) : null,
  };

  const isStep1Valid =
    !phoneError(details.phone) &&
    (details.method === 'pickup' || !addressError(details.address));

  const markTouched = (field: keyof DeliveryDetails) => setTouched((t) => ({ ...t, [field]: true }));

  // Reformatting the phone value on every keystroke (inserting "(", ")", "-")
  // grows the string mid-typing; without this the browser keeps the caret at
  // its old index instead of the end, so digits get inserted out of order.
  const phoneInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = phoneInputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(details.phone.length, details.phone.length);
    }
  }, [details.phone]);

  // After a successful order, show the confirmation briefly, then go to the account.
  useEffect(() => {
    if (!orderNumber) return;
    const timer = window.setTimeout(() => navigate('/account'), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [orderNumber, navigate]);

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

  const handleContinue = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ phone: true, address: true });
    if (isStep1Valid) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder({
        items: lines.map((line) => ({
          productId: Number(line.product.id),
          quantity: line.quantity,
          size: line.size,
        })),
        contactPhone: details.phone,
        deliveryMethod: DELIVERY_METHOD_TO_API[details.method],
        address: details.method === 'courier' ? details.address : undefined,
        promoCode: promo?.code,
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
      <div className="container checkout-success" role="status">
        <svg className="checkout-success__check" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="checkout-success__check-circle" cx="26" cy="26" r="24" fill="none" />
          <path className="checkout-success__check-mark" fill="none" d="M14 27l8 8 16-17" />
        </svg>
        <h1>Заказ оформлен!</h1>
        <p>Номер вашего заказа</p>
        <span className="checkout-success__number">{orderNumber}</span>
        <p className="checkout-success__note">
          Мы свяжемся с вами для подтверждения. Оплата — при получении заказа.
        </p>
        <p className="checkout-success__redirect">Переходим в личный кабинет…</p>
        <Link to="/account">
          <Button variant="primary" size="lg">
            В личный кабинет
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
            <label htmlFor="phone">Телефон</label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              ref={phoneInputRef}
              value={details.phone}
              className={errors.phone ? 'has-error' : ''}
              onChange={(e) => setDetails({ ...details, phone: formatPhoneInput(e.target.value) })}
              onBlur={() => markTouched('phone')}
              placeholder="+7 (700) 000-00-00"
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
                <label htmlFor="address">Адрес</label>
                <input
                  id="address"
                  value={details.address}
                  className={errors.address ? 'has-error' : ''}
                  onChange={(e) => setDetails({ ...details, address: e.target.value })}
                  onBlur={() => markTouched('address')}
                  placeholder="г. Алматы, ул. Абая, д. 10, кв. 5"
                  autoComplete="street-address"
                />
                {errors.address && <span className="checkout__error">{errors.address}</span>}
              </div>
            </>
          )}

          <Button type="submit" variant="primary" size="lg" className="checkout__submit" disabled={!isStep1Valid}>
            Продолжить
          </Button>
        </form>
      ) : (
        <div className="checkout__summary">
          <section className="checkout-card">
            <h4 className="checkout-card__title">
              <span className="checkout-card__icon"><TruckIcon /></span>
              Доставка
            </h4>
            <p className="checkout-card__strong">{user.name}</p>
            <p>{details.phone}</p>
            <p className="checkout-card__muted">
              {details.method === 'courier' ? details.address : 'Самовывоз из пункта выдачи'}
            </p>
          </section>

          <section className="checkout-card">
            <h4 className="checkout-card__title">
              <span className="checkout-card__icon"><WalletIcon /></span>
              Способ оплаты
            </h4>
            <p>Оплата при получении</p>
          </section>

          <section className="checkout-card">
            <h4 className="checkout-card__title">
              <span className="checkout-card__icon"><BagIcon /></span>
              Состав заказа
            </h4>
            <ul className="checkout-items">
              {lines.map((line) => (
                <li key={line.key} className="checkout-item">
                  <FadeImage src={line.product.images[0]} alt={line.product.name} className="checkout-item__thumb" />
                  <div className="checkout-item__info">
                    <span className="checkout-item__name">{line.product.name}</span>
                    <span className="checkout-item__meta">
                      {line.size ? `${line.size} · ` : ''}{line.quantity} шт.
                    </span>
                  </div>
                  <span className="checkout-item__price">
                    {formatPrice((line.product.discountPrice ?? line.product.price) * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="checkout-promo">
            <span className="checkout-promo__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12V4h8l10 10-8 8z" />
                <circle cx="7.5" cy="8.5" r="1.3" />
              </svg>
            </span>
            <div className="checkout-promo__body">
              <PromoCodeInput />
            </div>
          </section>

          <div className="checkout__summary-total">
            <span className="checkout__summary-total-label">Итого</span>
            {promo ? (
              <span className="checkout__summary-total-value">
                <span className="checkout__summary-total-old">{formatPrice(totalPrice)}</span>
                {formatPrice(finalTotal)}
              </span>
            ) : (
              <span className="checkout__summary-total-value">{formatPrice(totalPrice)}</span>
            )}
          </div>

          {submitError && <span className="checkout__error checkout__submit-error" role="alert">{submitError}</span>}

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
            <Button variant="primary" size="lg" onClick={handleConfirm} disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
              {isSubmitting ? 'Оформляем...' : 'Подтвердить заказ'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
