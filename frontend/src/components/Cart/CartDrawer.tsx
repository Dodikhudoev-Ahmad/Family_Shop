import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart, type CartLine } from '../../context/CartContext';
import { formatPrice } from '../../utils/formatPrice';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { PromoCodeInput } from '../PromoCodeInput/PromoCodeInput';
import { FadeImage } from '../FadeImage/FadeImage';
import './CartDrawer.css';

export function CartDrawer() {
  const { lines, isOpen, closeCart, updateQuantity, removeItem, totalPrice, promo, finalTotal } = useCart();
  useLockBodyScroll(isOpen);

  const [pendingRemove, setPendingRemove] = useState<CartLine | null>(null);

  const handleRemove = () => {
    if (!pendingRemove) return;
    removeItem(pendingRemove.key);
    setPendingRemove(null);
  };

  return (
    <>
      <div className={`cart-drawer__overlay ${isOpen ? 'is-open' : ''}`} onClick={closeCart} aria-hidden="true" />
      <aside className={`cart-drawer ${isOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Корзина">
        <div className="cart-drawer__header">
          <h3>Корзина</h3>
          <button className="cart-drawer__close" onClick={closeCart} aria-label="Закрыть корзину">
            &times;
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="cart-drawer__empty">
            <CartEmptyIcon />
            <p>Пока здесь пусто — самое время что-нибудь присмотреть</p>
            <Button variant="secondary" onClick={closeCart}>
              Продолжить покупки
            </Button>
          </div>
        ) : (
          <>
            <ul className="cart-drawer__list">
              {lines.map((line) => (
                <li key={line.key} className="cart-line">
                  <FadeImage src={line.product.images[0]} alt={line.product.name} className="cart-line__image" />
                  <div className="cart-line__info">
                    <span className="cart-line__name">{line.product.name}</span>
                    <span className="cart-line__size">Размер: {line.size}</span>
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

            <div className="cart-drawer__footer">
              <PromoCodeInput />
              <div className="cart-drawer__total">
                <span>Итого</span>
                {promo ? (
                  <span className="cart-drawer__total-value">
                    <span className="cart-drawer__total-old">{formatPrice(totalPrice)}</span>
                    {formatPrice(finalTotal)}
                  </span>
                ) : (
                  <span>{formatPrice(totalPrice)}</span>
                )}
              </div>
              <Link to="/checkout" onClick={closeCart}>
                <Button variant="primary" size="lg" className="cart-drawer__checkout-btn">
                  Оформить заказ
                </Button>
              </Link>
            </div>
          </>
        )}
      </aside>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Удалить «${pendingRemove?.product.name}» из корзины?`}
        description={`Размер: ${pendingRemove?.size}. Товар будет удалён из корзины.`}
        confirmLabel="Удалить"
        onConfirm={handleRemove}
        onCancel={() => setPendingRemove(null)}
      />
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
