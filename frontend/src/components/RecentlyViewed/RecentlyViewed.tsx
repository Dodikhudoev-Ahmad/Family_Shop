import { useRecentlyViewed } from '../../context/RecentlyViewedContext';
import { useProducts } from '../../context/ProductsContext';
import { ProductCard } from '../ProductCard/ProductCard';
import { Slider } from '../Slider/Slider';
import { Reveal } from '../Reveal';
import { useTranslation } from 'react-i18next';
import { HomeBand, type BandTone } from '../HomeBand/HomeBand';

interface RecentlyViewedProps {
  // Excludes the product currently being viewed (on ProductPage) - showing it
  // in its own "recently viewed" row would be redundant.
  excludeId?: string;
  // ProductPage nests this inside its own .container, so it must not add a
  // second one (double horizontal padding) the way the HomePage usage needs to.
  className?: string;
  // Home page only: render as a full-width coloured band of this tone instead of a bare section.
  tone?: BandTone;
}

export function RecentlyViewed({ excludeId, className = 'home-section container', tone }: RecentlyViewedProps) {
  const { t } = useTranslation();
  const { recentIds } = useRecentlyViewed();
  const { products } = useProducts();

  const visible = recentIds
    .filter((id) => id !== excludeId)
    .map((id) => products.find((p) => p.id === id))
    .filter((p) => p !== undefined);

  if (visible.length === 0) return null;

  const content = (
    <>
      <Reveal>
        <h3 className="home-section__title">{t('home.recentlyViewed')}</h3>
      </Reveal>
      <Reveal>
        <Slider>
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </Slider>
      </Reveal>
    </>
  );

  if (tone) return <HomeBand tone={tone}>{content}</HomeBand>;
  return <section className={className}>{content}</section>;
}
