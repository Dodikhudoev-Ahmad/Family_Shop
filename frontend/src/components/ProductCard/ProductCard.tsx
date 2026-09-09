import { Link } from 'react-router-dom';
import type { Product } from '../../types/product';
import { useFavorites } from '../../context/FavoritesContext';
import { useQuickView } from '../../context/QuickViewContext';
import { FadeImage } from '../FadeImage/FadeImage';
import './ProductCard.css';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { open: openQuickView } = useQuickView();
  const favorite = isFavorite(product.id);
  const discountPercent = product.discountPrice
    ? Math.round((1 - product.discountPrice / product.price) * 100)
    : null;

  return (
    <div className="product-card">
      <Link to={`/product/${product.id}`} className="product-card__media">
        <FadeImage src={product.images[0]} alt={product.name} loading="lazy" />
        {product.images[1] && (
          <FadeImage src={product.images[1]} alt="" className="product-card__media-alt" loading="lazy" />
        )}

        {discountPercent && <span className="product-card__badge">−{discountPercent}%</span>}

        <button
          className={`product-card__fav product-card__fav--mobile ${favorite ? 'is-active' : ''}`}
          aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite(product.id, product.name);
          }}
        >
          <HeartIcon filled={favorite} />
        </button>

        <div className="product-card__hover-actions">
          <button
            className={`product-card__icon-btn ${favorite ? 'is-active' : ''}`}
            aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={(e) => {
              e.preventDefault();
              toggleFavorite(product.id, product.name);
            }}
          >
            <HeartIcon filled={favorite} />
          </button>
          <button
            className="product-card__icon-btn"
            aria-label="Быстрый просмотр"
            onClick={(e) => {
              e.preventDefault();
              openQuickView(product);
            }}
          >
            <EyeIcon />
          </button>
        </div>
      </Link>

      <Link to={`/product/${product.id}`} className="product-card__info">
        <span className="product-card__category">{categoryLabel(product.gender)}</span>
        <span className="product-card__name">{product.name}</span>
        <span className="product-card__price">
          {product.discountPrice && <span className="product-card__price-old">{formatPrice(product.price)}</span>}
          <span className={product.discountPrice ? 'product-card__price-new' : ''}>
            {formatPrice(product.discountPrice ?? product.price)}
          </span>
        </span>
      </Link>
    </div>
  );
}

function categoryLabel(gender: Product['gender']) {
  switch (gender) {
    case 'female':
      return 'Женское';
    case 'male':
      return 'Мужское';
    case 'kids':
      return 'Детское';
  }
}

export function formatPrice(value: number) {
  return `${value.toLocaleString('ru-RU')} ₽`;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M10 17.5s-7-4.35-7-9.5A4 4 0 0 1 10 5.5 4 4 0 0 1 17 8c0 5.15-7 9.5-7 9.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
