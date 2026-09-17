import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuickView } from '../../context/QuickViewContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/formatPrice';
import { isLowStock, isOutOfStock } from '../../utils/stock';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../Button/Button';
import { FadeImage } from '../FadeImage/FadeImage';
import type { Product } from '../../types/product';
import './QuickViewModal.css';

// Matches --transition-base in tokens.css - kept in sync manually since CSS custom
// properties aren't readable from a plain constant without a DOM round-trip.
const EXIT_ANIMATION_MS = 250;
const SWIPE_THRESHOLD_PX = 40;

export function QuickViewModal() {
  const { product, close } = useQuickView();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  // The modal keeps rendering the last product while it plays its exit
  // animation, even after the context has already cleared `product` to null.
  const [displayProduct, setDisplayProduct] = useState<Product | null>(null);
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (product) {
      setDisplayProduct(product);
      setSelectedSize(null);
      setActiveImage(0);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setDisplayProduct(null), EXIT_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [product, close]);

  useLockBodyScroll(!!displayProduct);

  if (!displayProduct) return null;

  const images = displayProduct.images;
  const hasGallery = images.length > 1;
  const outOfStock = isOutOfStock(displayProduct.stock);
  const lowStock = isLowStock(displayProduct.stock);

  const goToImage = (index: number) => setActiveImage(((index % images.length) + images.length) % images.length);
  const nextImage = () => goToImage(activeImage + 1);
  const prevImage = () => goToImage(activeImage - 1);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) {
      nextImage();
    } else {
      prevImage();
    }
  };

  const handleAdd = () => {
    if (!selectedSize) {
      showToast('Пожалуйста, выберите размер', 'error');
      return;
    }
    addItem(displayProduct, selectedSize);
    close();
  };

  return (
    <>
      <div className={`quick-view__overlay ${visible ? 'is-open' : ''}`} onClick={close} />
      <div
        className={`quick-view ${visible ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={displayProduct.name}
      >
        <button className="quick-view__close" onClick={close} aria-label="Закрыть">
          &times;
        </button>
        <div className="quick-view__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <FadeImage src={images[activeImage]} alt={displayProduct.name} />
          {hasGallery && (
            <>
              <button className="quick-view__image-arrow quick-view__image-arrow--left" onClick={prevImage} aria-label="Предыдущее фото">
                <ArrowIcon flipped />
              </button>
              <button className="quick-view__image-arrow quick-view__image-arrow--right" onClick={nextImage} aria-label="Следующее фото">
                <ArrowIcon />
              </button>
              <div className="quick-view__image-dots">
                {images.map((img, i) => (
                  <button
                    key={img}
                    className={`quick-view__image-dot ${i === activeImage ? 'is-active' : ''}`}
                    onClick={() => goToImage(i)}
                    aria-label={`Фото ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="quick-view__info">
          <h3>{displayProduct.name}</h3>
          <div className="quick-view__price">
            {displayProduct.discountPrice && (
              <span className="quick-view__price-old">{formatPrice(displayProduct.price)}</span>
            )}
            <span className={displayProduct.discountPrice ? 'quick-view__price-new' : ''}>
              {formatPrice(displayProduct.discountPrice ?? displayProduct.price)}
            </span>
          </div>
          {lowStock && <span className="quick-view__stock-warning">Осталось {displayProduct.stock} шт</span>}
          <p className="quick-view__desc">{displayProduct.description}</p>

          <div className="quick-view__sizes">
            {displayProduct.sizes.map((size) => (
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
            <Link to={`/product/${displayProduct.id}`} onClick={close}>
              <Button variant="ghost">Подробнее о товаре</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function ArrowIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ transform: flipped ? 'rotate(180deg)' : undefined }}>
      <path d="M7 4l7 6-7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
