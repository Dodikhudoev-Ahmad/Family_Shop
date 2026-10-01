import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart, type CartLine } from '../context/CartContext';
import { formatPrice } from '../utils/formatPrice';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs';
import { Button } from '../components/Button/Button';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { PromoCodeInput } from '../components/PromoCodeInput/PromoCodeInput';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { PromoBanner } from '../components/PromoBanner/PromoBanner';
import './CartPage.css';
import { useTranslation } from 'react-i18next';

export function CartPage() {
  const { t } = useTranslation();
  const { lines, updateQuantity, removeItem, remainingStock, totalPrice, promo, finalTotal } = useCart();
  const [pendingRemove, setPendingRemove] = useState<CartLine | null>(null);

  const handleRemove = () => {
    if (!pendingRemove) return;
    removeItem(pendingRemove.key);
    setPendingRemove(null);
  };

  return (
    <>
      {/* PromoBanner applies its own .container - kept as a sibling of the page's
          .container div rather than nested inside it, so widths/padding don't stack. */}
      <PromoBanner placement="Cart" />

      <div className="container cart-page">
      <Breadcrumbs items={[{ label: t('common.home'), href: '/' }, { label: t('cart.title') }]} />
      <h1 className="cart-page__title">{t('cart.title')}</h1>

      {lines.length === 0 ? (
        <div className="cart-page__empty">
          <CartEmptyIcon />
          <p>{t('cart.empty')}</p>
          <Link to="/catalog">
            <Button variant="primary">{t('common.toCatalog')}</Button>
          </Link>
        </div>
      ) : (
        <div className="cart-page__layout">
          <ul className="cart-page__list">
            {lines.map((line) => (
              <li key={line.key} className="cart-line">
                <FadeImage src={line.product.images[0]} alt={line.product.name} className="cart-line__image" />
                <div className="cart-line__info">
                  <span className="cart-line__name">{line.product.name}</span>
                  {line.size && <span className="cart-line__size">{t('cart.size', { size: line.size })}</span>}
                  <span className="cart-line__price">
                    {formatPrice((line.product.discountPrice ?? line.product.price) * line.quantity)}
                  </span>
                  <div className="cart-line__controls">
                    <div className="quantity-stepper quantity-stepper--sm">
                      <button onClick={() => updateQuantity(line.key, line.quantity - 1)} aria-label={t('cart.decrease')}>
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.key, line.quantity + 1)}
                        disabled={remainingStock(line.product) <= 0}
                        aria-label={t('cart.increase')}
                      >
                        +
                      </button>
                    </div>
                    <button className="cart-line__remove" onClick={() => setPendingRemove(line)} aria-label={t('cart.removeItem')}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="cart-page__summary">
            <h2 className="cart-page__summary-title">{t('cart.yourOrder')}</h2>
            <PromoCodeInput />

            <div className="cart-page__summary-rows">
              <div className="cart-page__summary-row">
                <span>{t('cart.sum')}</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              {promo && (
                <div className="cart-page__summary-row cart-page__summary-row--discount">
                  <span>{t('cart.promoDiscount')}</span>
                  <span>−{formatPrice(totalPrice - finalTotal)}</span>
                </div>
              )}
              <div className="cart-page__summary-row">
                <span>{t('cart.delivery')}</span>
                <span>{t('cart.deliveryTbd')}</span>
              </div>
              <div className="cart-page__summary-row cart-page__summary-total">
                <span>{t('common.total')}</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>
            </div>

            <Link to="/checkout">
              <Button variant="primary" size="lg" className="cart-page__checkout-btn">
                {t('cart.checkout')}
              </Button>
            </Link>
            <p className="cart-page__note">{t('cart.note')}</p>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={t('cart.removeTitle', { name: pendingRemove?.product.name })}
        description={pendingRemove?.size ? t('cart.removeDescSize', { size: pendingRemove.size }) : t('cart.removeDesc')}
        confirmLabel={t('common.delete')}
        onConfirm={handleRemove}
        onCancel={() => setPendingRemove(null)}
      />
      </div>
    </>
  );
}

function CartEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 21 21" fill="none">
      <path d="M5 7h11l-1 10H6L5 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
