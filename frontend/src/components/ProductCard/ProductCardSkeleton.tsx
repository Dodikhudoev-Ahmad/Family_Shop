import './ProductCard.css';
import './ProductCardSkeleton.css';

export function ProductCardSkeleton() {
  return (
    <div className="product-card">
      <div className="skeleton product-card-skeleton__media" />
      <div className="skeleton product-card-skeleton__line product-card-skeleton__line--sm" />
      <div className="skeleton product-card-skeleton__line" />
      <div className="skeleton product-card-skeleton__line product-card-skeleton__line--sm" />
    </div>
  );
}
