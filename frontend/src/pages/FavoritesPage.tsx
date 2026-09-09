import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext';
import { useProducts } from '../context/ProductsContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Button } from '../components/Button/Button';
import './FavoritesPage.css';

const REMOVE_DELAY = 300;

// Keeps a removed product visible (with a fade-out class) for REMOVE_DELAY
// after it drops out of favoriteIds, instead of yanking it out instantly.
function useFadingIds(currentIds: string[]) {
  const [visibleIds, setVisibleIds] = useState(currentIds);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef(currentIds);

  useEffect(() => {
    const prevIds = prevIdsRef.current;
    prevIdsRef.current = currentIds;

    const removed = prevIds.filter((id) => !currentIds.includes(id));
    const added = currentIds.filter((id) => !prevIds.includes(id));

    if (added.length > 0) {
      setVisibleIds((prev) => [...prev, ...added]);
    }

    if (removed.length > 0) {
      setRemovingIds((prev) => new Set([...prev, ...removed]));
      let raf1 = 0;
      let raf2 = 0;
      const timer = setTimeout(() => {
        // Drop the item (the grid reflows here), then wait a couple of frames
        // before lifting the pointer-events lock so a click can't land on a
        // neighbor that just slid into the removed card's spot.
        setVisibleIds((prev) => prev.filter((id) => !removed.includes(id)));
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            setRemovingIds((prev) => {
              const next = new Set(prev);
              removed.forEach((id) => next.delete(id));
              return next;
            });
          });
        });
      }, REMOVE_DELAY);
      return () => {
        clearTimeout(timer);
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
  }, [currentIds]);

  return { visibleIds, removingIds, isRemoving: removingIds.size > 0 };
}

export function FavoritesPage() {
  const { favoriteIds } = useFavorites();
  const { products } = useProducts();
  const { visibleIds, removingIds, isRemoving } = useFadingIds(favoriteIds);

  const visibleProducts = products.filter((p) => visibleIds.includes(p.id));

  if (visibleProducts.length === 0) {
    return (
      <div className="container favorites">
        <h1 className="favorites__title">Избранное</h1>
        <div className="favorites__empty">
          <HeartEmptyIcon />
          <p>В избранном пока ничего нет</p>
          <Link to="/catalog">
            <Button variant="primary">В каталог</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container favorites">
      <h1 className="favorites__title">Избранное</h1>
      <div className={`favorites__grid ${isRemoving ? 'is-removing-item' : ''}`}>
        {visibleProducts.map((product) => (
          <div key={product.id} className={`favorites__item ${removingIds.has(product.id) ? 'is-removing' : ''}`}>
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeartEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17.5s-7-4.35-7-9.5A4 4 0 0 1 10 5.5 4 4 0 0 1 17 8c0 5.15-7 9.5-7 9.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
