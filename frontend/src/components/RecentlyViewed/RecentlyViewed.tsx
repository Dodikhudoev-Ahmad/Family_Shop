import { useRecentlyViewed } from '../../context/RecentlyViewedContext';
import { useProducts } from '../../context/ProductsContext';
import { ProductCard } from '../ProductCard/ProductCard';
import { Slider } from '../Slider/Slider';
import { Reveal } from '../Reveal';

interface RecentlyViewedProps {
  // Excludes the product currently being viewed (on ProductPage) - showing it
  // in its own "recently viewed" row would be redundant.
  excludeId?: string;
  // ProductPage nests this inside its own .container, so it must not add a
  // second one (double horizontal padding) the way the HomePage usage needs to.
  className?: string;
}

export function RecentlyViewed({ excludeId, className = 'home-section container' }: RecentlyViewedProps) {
  const { recentIds } = useRecentlyViewed();
  const { products } = useProducts();

  const visible = recentIds
    .filter((id) => id !== excludeId)
    .map((id) => products.find((p) => p.id === id))
    .filter((p) => p !== undefined);

  if (visible.length === 0) return null;

  return (
    <section className={className}>
      <Reveal>
        <h3 className="home-section__title">Вы недавно смотрели</h3>
      </Reveal>
      <Reveal>
        <Slider>
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </Slider>
      </Reveal>
    </section>
  );
}
