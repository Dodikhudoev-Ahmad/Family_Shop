import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatPrice';
import { Button } from '../components/Button/Button';
import { PromoCodeInput } from '../components/PromoCodeInput/PromoCodeInput';
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

const NAME_RE = /^[A-Za-zА-Яа-яЁё\s-]+$/;
const NAME_MIN_LENGTH = 2;
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

function nameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Укажите имя и фамилию';
  if (trimmed.length < NAME_MIN_LENGTH) return 'Слишком короткое имя';
  if (!NAME_RE.test(value)) return 'Только буквы, пробел и дефис';
  return null;
}

function phoneError(value: string): string | null {
  const national = getNationalDigits(value);
  if (!national) return 'Укажите номер телефона';
  if (national.length < NATIONAL_PHONE_LENGTH) return 'Введите номер полностью';
  return null;
}

function cityError(value: string): string | null {
  return value.trim() ? null : 'Укажите город';
}

function addressError(value: string): string | null {
  return value.trim() ? null : 'Укажите адрес';
}

export function CheckoutPage() {
  const { lines, totalPrice, finalTotal, promo, clearCart } = useCart();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<DeliveryDetails>(initialDetails);
  const [touched, setTouched] = useState<Partial<Record<keyof DeliveryDetails, boolean>>>({});
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors = {
    fullName: touched.fullName ? nameError(details.fullName) : null,
    phone: touched.phone ? phoneError(details.phone) : null,
    city: touched.city && details.method === 'courier' ? cityError(details.city) : null,
    address: touched.address && details.method === 'courier' ? addressError(details.address) : null,
  };

  const isStep1Valid =
    !nameError(details.fullName) &&
    !phoneError(details.phone) &&
    (details.method === 'pickup' || (!cityError(details.city) && !addressError(details.address)));

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
    setTouched({ fullName: true, phone: true, city: true, address: true });
    if (isStep1Valid) {
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
              onBlur={() => markTouched('fullName')}
            />
            {errors.fullName && <span className="checkout__error">{errors.fullName}</span>}
          </div>

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
                <label htmlFor="city">Город</label>
                <input
                  id="city"
                  value={details.city}
                  className={errors.city ? 'has-error' : ''}
                  onChange={(e) => setDetails({ ...details, city: e.target.value })}
                  onBlur={() => markTouched('city')}
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
                  onBlur={() => markTouched('address')}
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
                <span>{line.product.name}{line.size ? ` · ${line.size}` : ''} × {line.quantity}</span>
                <span>{formatPrice((line.product.discountPrice ?? line.product.price) * line.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="checkout__summary-block">
            <h4>Промокод</h4>
            <PromoCodeInput />
          </div>

          <div className="checkout__summary-total">
            <span>Итого</span>
            {promo ? (
              <span className="checkout__summary-total-value">
                <span className="checkout__summary-total-old">{formatPrice(totalPrice)}</span>
                {formatPrice(finalTotal)}
              </span>
            ) : (
              <span>{formatPrice(totalPrice)}</span>
            )}
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
