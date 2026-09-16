import { Link } from 'react-router-dom';
import { heroImages } from '../data/heroImages';
import { useProducts } from '../context/ProductsContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCard/ProductCardSkeleton';
import { Slider } from '../components/Slider/Slider';
import { Reveal } from '../components/Reveal';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { PromoBanner } from '../components/PromoBanner/PromoBanner';
import { useSeo } from '../hooks/useSeo';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../data/seo';
import './HomePage.css';

const heroTiles = [
  { key: 'women', title: 'Женское', slug: 'women' },
  { key: 'men', title: 'Мужское', slug: 'men' },
  { key: 'kids', title: 'Детское', slug: 'kids' },
] as const;

export function HomePage() {
  useSeo({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION });
  const { products, isLoading, error } = useProducts();

  const newest = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
  const bestWomen = products.filter((p) => p.gender === 'female' && p.isBestseller);
  const bestMen = products.filter((p) => p.gender === 'male' && p.isBestseller);

  return (
    <div className="home">
      <section className="hero container">
        {heroTiles.map((tile) => (
          <Link key={tile.key} to={`/catalog/${tile.slug}`} className="hero__tile">
            <FadeImage src={heroImages[tile.key]} alt={tile.title} />
            <div className="hero__overlay" />
            <div className="hero__content">
              <h2 className="hero__title">{tile.title}</h2>
              <span className="hero__cta">
                Смотреть
                <ArrowRight />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <PromoBanner />

      {error && (
        <p className="container home__error">
          Не удалось загрузить товары: {error}. Убедитесь, что backend запущен на {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5280/api/v1'}.
        </p>
      )}

      <section className="home-section container">
        <Reveal>
          <h3 className="home-section__title">Новинки недели</h3>
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
            <h3 className="home-section__title">Хиты продаж · Женское</h3>
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
            <h3 className="home-section__title">Хиты продаж · Мужское</h3>
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
