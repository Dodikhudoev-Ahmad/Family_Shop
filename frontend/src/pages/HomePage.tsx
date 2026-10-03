import { Link } from 'react-router-dom';
import { heroImages } from '../data/heroImages';
import { useProducts } from '../context/ProductsContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCard/ProductCardSkeleton';
import { Slider } from '../components/Slider/Slider';
import { Reveal } from '../components/Reveal';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { PromoBanner } from '../components/PromoBanner/PromoBanner';
import { RecentlyViewed } from '../components/RecentlyViewed/RecentlyViewed';
import { useSeo } from '../hooks/useSeo';
import { SITE_NAME } from '../data/seo';
import { API_BASE_URL } from '../lib/config';
import './HomePage.css';
import { useTranslation } from 'react-i18next';

const heroTiles = [
  { key: 'women', slug: 'women' },
  { key: 'men', slug: 'men' },
  { key: 'kids', slug: 'kids' },
] as const;

export function HomePage() {
  const { t } = useTranslation();
  useSeo({ title: t('seo.defaultTitle', { site: SITE_NAME }), description: t('seo.defaultDescription') });
  const { products, isLoading, error } = useProducts();

  const newest = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
  const bestWomen = products.filter((p) => p.gender === 'female' && p.isBestseller);
  const bestMen = products.filter((p) => p.gender === 'male' && p.isBestseller);

  return (
    <div className="home">
      <section className="hero container">
        {heroTiles.map((tile) => (
          <Link key={tile.key} to={`/catalog/${tile.slug}`} className="hero__tile">
            <FadeImage src={heroImages[tile.key]} alt={t(`categories.${tile.slug}`)} />
            <div className="hero__overlay" />
            <div className="hero__content">
              <h2 className="hero__title">{t(`categories.${tile.slug}`)}</h2>
              <span className="hero__cta">
                {t('home.view')}
                <ArrowRight />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <PromoBanner placement="Home" />

      {error && (
        <p className="container home__error">
          {t('home.loadError', { error, url: API_BASE_URL })}
        </p>
      )}

      <section className="home-section container">
        <Reveal>
          <h3 className="home-section__title">{t('home.newArrivals')}</h3>
        </Reveal>
        <Reveal>
          {isLoading ? (
            <div className="home__skeleton-row">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <Slider>
              {newest.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Slider>
          )}
        </Reveal>
      </section>

      {!isLoading && bestWomen.length > 0 && (
        <section className="home-section container">
          <Reveal>
            <h3 className="home-section__title">{t('home.hits', { category: t('categories.women') })}</h3>
          </Reveal>
          <Reveal>
            <Slider>
              {bestWomen.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Slider>
          </Reveal>
        </section>
      )}

      {!isLoading && bestMen.length > 0 && (
        <section className="home-section container">
          <Reveal>
            <h3 className="home-section__title">{t('home.hits', { category: t('categories.men') })}</h3>
          </Reveal>
          <Reveal>
            <Slider>
              {bestMen.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Slider>
          </Reveal>
        </section>
      )}

      <RecentlyViewed />
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="hero__arrow">
      <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
