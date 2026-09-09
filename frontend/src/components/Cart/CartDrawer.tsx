import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../ProductCard/ProductCard';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../Button/Button';
import './CartDrawer.css';

export function CartDrawer() {
  const { lines, isOpen, closeCart, updateQuantity, removeItem, totalPrice } = useCart();
  useLockBodyScroll(isOpen);

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
            <p>Ваша корзина пуста</p>
            <Button variant="secondary" onClick={closeCart}>
              Продолжить покупки
            </Button>
          </div>
        ) : (
          <>
            <ul className="cart-drawer__list">
              {lines.map((line) => (
                <li key={line.key} className="cart-line">
                  <img src={line.product.images[0]} alt={line.product.name} className="cart-line__image" />
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
                        <button onClick={() => updateQuantity(line.key, line.quantity + 1)} aria-label="Увеличить">
                          +
                        </button>
                      </div>
                      <button className="cart-line__remove" onClick={() => removeItem(line.key)} aria-label="Удалить товар">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="cart-drawer__footer">
              <div className="cart-drawer__total">
                <span>Итого</span>
                <span>{formatPrice(totalPrice)}</span>
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
    </>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
