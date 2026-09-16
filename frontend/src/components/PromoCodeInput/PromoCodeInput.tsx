import { useState, type FormEvent } from 'react';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../utils/formatPrice';
import './PromoCodeInput.css';

export function PromoCodeInput() {
  const { promo, promoError, isApplyingPromo, applyPromoCode, clearPromoCode, totalPrice } = useCart();
  const [code, setCode] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isApplyingPromo) return;
    void applyPromoCode(code);
  };

  if (promo) {
    return (
      <div className="promo-code promo-code--applied">
        <div className="promo-code__applied-row">
          <span className="promo-code__applied-text">
            Промокод <strong>{promo.code}</strong> применён
            {promo.discountType === 0 ? ` · −${promo.discountValue}%` : ` · −${formatPrice(promo.discountValue)}`}
          </span>
          <button type="button" className="promo-code__remove" onClick={clearPromoCode}>
            Убрать
          </button>
        </div>
        <div className="promo-code__totals">
          <span className="promo-code__old-total">{formatPrice(totalPrice)}</span>
          <span className="promo-code__new-total">{formatPrice(promo.finalTotal)}</span>
        </div>
      </div>
    );
  }

  return (
    <form className="promo-code" onSubmit={handleSubmit}>
      <div className="promo-code__row">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Промокод"
          className={promoError ? 'has-error' : ''}
          disabled={isApplyingPromo}
          aria-label="Промокод"
        />
        <button type="submit" className="promo-code__apply" disabled={isApplyingPromo || !code.trim()}>
          {isApplyingPromo ? 'Проверяем...' : 'Применить'}
        </button>
      </div>
      {promoError && <span className="promo-code__error">{promoError}</span>}
    </form>
  );
}
