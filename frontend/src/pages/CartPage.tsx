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

export function CartPage() {
  const { lines, updateQuantity, removeItem, totalPrice, promo, finalTotal } = useCart();
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
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Корзина' }]} />
      <h1 className="cart-page__title">Корзина</h1>

      {lines.length === 0 ? (
        <div className="cart-page__empty">
          <CartEmptyIcon />
          <p>Пока здесь пусто — самое время что-нибудь присмотреть</p>
          <Link to="/catalog">
            <Button variant="primary">В каталог</Button>
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
                  {line.size && <span className="cart-line__size">Размер: {line.size}</span>}
                  <span className="cart-line__price">
                    {formatPrice((line.product.discountPrice ?? line.product.price) * line.quantity)}
                  </span>
                  <div className="cart-line__controls">
                    <div className="quantity-stepper quantity-stepper--sm">
                      <button onClick={() => updateQuantity(line.key, line.quantity - 1)} aria-label="Уменьшить">
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.key, line.quantity + 1)}
                        disabled={line.quantity >= line.product.stock}
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                    <button className="cart-line__remove" onClick={() => setPendingRemove(line)} aria-label="Удалить товар">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="cart-page__summary">
            <h2 className="cart-page__summary-title">Ваш заказ</h2>
            <PromoCodeInput />

            <div className="cart-page__summary-rows">
              <div className="cart-page__summary-row">
                <span>Сумма</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              {promo && (
                <div className="cart-page__summary-row cart-page__summary-row--discount">
                  <span>Скидка по промокоду</span>
                  <span>−{formatPrice(totalPrice - finalTotal)}</span>
                </div>
              )}
              <div className="cart-page__summary-row">
                <span>Доставка</span>
                <span>Уточняется при оформлении</span>
              </div>
              <div className="cart-page__summary-row cart-page__summary-total">
                <span>Итого</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>
            </div>

            <Link to="/checkout">
              <Button variant="primary" size="lg" className="cart-page__checkout-btn">
                Оформить заказ
              </Button>
            </Link>
            <p className="cart-page__note">Оплата при получении. Курьером или самовывозом — выбор на следующем шаге.</p>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Удалить «${pendingRemove?.product.name}» из корзины?`}
        description={pendingRemove?.size ? `Размер: ${pendingRemove.size}. Товар будет удалён из корзины.` : 'Товар будет удалён из корзины.'}
        confirmLabel="Удалить"
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
