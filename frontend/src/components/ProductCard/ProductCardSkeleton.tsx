import './ProductCard.css';
import './ProductCardSkeleton.css';

export function ProductCardSkeleton() {
  return (
    <div className="product-card">
      <div className="skeleton product-card-skeleton__media" />
      <div className="product-card__info">
        <div className="skeleton product-card-skeleton__line product-card-skeleton__line--sm" />
        <div className="skeleton product-card-skeleton__line product-card-skeleton__line--name" />
        <div className="skeleton product-card-skeleton__line product-card-skeleton__line--price" />
      </div>
    </div>
  );
}
