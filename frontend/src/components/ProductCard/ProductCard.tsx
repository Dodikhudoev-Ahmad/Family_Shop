import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../types/product';
import { useFavorites } from '../../context/FavoritesContext';
import { useQuickView } from '../../context/QuickViewContext';
import { useCategories } from '../../context/CategoriesContext';
import { FadeImage } from '../FadeImage/FadeImage';
import { StarRating } from '../StarRating/StarRating';
import { formatPrice } from '../../utils/formatPrice';
import { isLowStock, isOutOfStock } from '../../utils/stock';
import './ProductCard.css';

interface ProductCardProps {
  product: Product;
  // When set, removing this product from favorites goes through the caller
  // instead of toggling immediately - FavoritesPage uses this to confirm
  // removal first. Adding to favorites (from any page) always stays instant.
  onRequestRemoveFromFavorites?: (product: Product) => void;
}

export function ProductCard({ product, onRequestRemoveFromFavorites }: ProductCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { open: openQuickView } = useQuickView();
  const { categories } = useCategories();
  const favorite = isFavorite(product.id);
  // Gender only means something for apparel-style categories (women/men/kids/shoes-bags) -
  // showing "Мужское"/"Женское" on a microwave or a dumbbell would be confusing.
  const showGenderLabel = categories.find((c) => c.id === product.categoryId)?.hasSizes ?? true;
  const discountPercent = product.discountPrice
    ? Math.round((1 - product.discountPrice / product.price) * 100)
    : null;
  const outOfStock = isOutOfStock(product.stock);
  const lowStock = isLowStock(product.stock);

  const handleFavoriteClick = (e: MouseEvent) => {
    e.preventDefault();
    if (favorite && onRequestRemoveFromFavorites) {
      onRequestRemoveFromFavorites(product);
      return;
    }
    toggleFavorite(product.id, product.name);
  };

  return (
    <div className={`product-card ${outOfStock ? 'is-out-of-stock' : ''}`}>
      <Link to={`/product/${product.id}`} className="product-card__media">
        <FadeImage src={product.images[0]} alt={product.name} loading="lazy" />
        {product.images[1] && (
          <FadeImage src={product.images[1]} alt="" className="product-card__media-alt" loading="lazy" />
        )}

        {outOfStock ? (
          <span className="product-card__badge product-card__badge--out">Нет в наличии</span>
        ) : (
          discountPercent && <span className="product-card__badge">−{discountPercent}%</span>
        )}

        <div className="product-card__mobile-actions">
          <button
            className={`product-card__icon-btn ${favorite ? 'is-active' : ''}`}
            aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={handleFavoriteClick}
          >
            <HeartIcon filled={favorite} />
          </button>
          <button
            className="product-card__icon-btn"
            aria-label="Быстрый просмотр"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openQuickView(product);
            }}
          >
            <EyeIcon />
          </button>
        </div>

        <div className="product-card__hover-actions">
          <button
            className={`product-card__icon-btn ${favorite ? 'is-active' : ''}`}
            aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={handleFavoriteClick}
          >
            <HeartIcon filled={favorite} />
          </button>
          <button
            className="product-card__icon-btn"
            aria-label="Быстрый просмотр"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openQuickView(product);
            }}
          >
            <EyeIcon />
          </button>
        </div>
      </Link>

      <Link to={`/product/${product.id}`} className="product-card__info">
        {showGenderLabel && <span className="product-card__category">{categoryLabel(product.gender)}</span>}
        <span className="product-card__name" title={product.name}>
          {product.name}
        </span>
        {product.reviewCount > 0 && (
          <span className="product-card__rating">
            <StarRating value={product.averageRating} size="sm" />
            <span className="product-card__rating-count">({product.reviewCount})</span>
          </span>
        )}
        <span className="product-card__price">
          {product.discountPrice && <span className="product-card__price-old">{formatPrice(product.price)}</span>}
          <span className={product.discountPrice ? 'product-card__price-new' : ''}>
            {formatPrice(product.discountPrice ?? product.price)}
          </span>
        </span>
        {lowStock && <span className="product-card__stock-warning">Осталось {product.stock} шт</span>}
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
