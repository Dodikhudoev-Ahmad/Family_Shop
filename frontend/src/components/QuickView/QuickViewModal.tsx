import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuickView } from '../../context/QuickViewContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/formatPrice';
import { isLowStock, isOutOfStock } from '../../utils/stock';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../Button/Button';
import { FadeImage } from '../FadeImage/FadeImage';
import './QuickViewModal.css';

export function QuickViewModal() {
  const { product, close } = useQuickView();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  useLockBodyScroll(!!product);

  if (!product) return null;

  const outOfStock = isOutOfStock(product.stock);
  const lowStock = isLowStock(product.stock);

  const handleAdd = () => {
    if (!selectedSize) {
      showToast('Пожалуйста, выберите размер', 'error');
      return;
    }
    addItem(product, selectedSize);
    close();
  };

  return (
    <>
      <div className="quick-view__overlay" onClick={close} />
      <div className="quick-view" role="dialog" aria-modal="true" aria-label={product.name}>
        <button className="quick-view__close" onClick={close} aria-label="Закрыть">
          &times;
        </button>
        <div className="quick-view__image">
          <FadeImage src={product.images[0]} alt={product.name} />
        </div>
        <div className="quick-view__info">
          <h3>{product.name}</h3>
          <div className="quick-view__price">
            {product.discountPrice && <span className="quick-view__price-old">{formatPrice(product.price)}</span>}
            <span className={product.discountPrice ? 'quick-view__price-new' : ''}>
              {formatPrice(product.discountPrice ?? product.price)}
            </span>
          </div>
          {lowStock && <span className="quick-view__stock-warning">Осталось {product.stock} шт</span>}
          <p className="quick-view__desc">{product.description}</p>

          <div className="quick-view__sizes">
            {product.sizes.map((size) => (
              <button
                key={size}
                className={`size-btn ${selectedSize === size ? 'is-selected' : ''}`}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="quick-view__actions">
            <Button variant="primary" size="lg" onClick={handleAdd} disabled={outOfStock}>
              {outOfStock ? 'Нет в наличии' : 'В корзину'}
            </Button>
            <Link to={`/product/${product.id}`} onClick={close}>
              <Button variant="ghost">Подробнее о товаре</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
