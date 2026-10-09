import { useState } from 'react';
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
import { HomeBand, alternatingTone, type BandTone } from '../components/HomeBand/HomeBand';
import { SaleBanner } from '../components/SaleBanner/SaleBanner';
import { QuickChips } from '../components/QuickChips/QuickChips';
import { useSeo } from '../hooks/useSeo';
import { useJsonLd } from '../hooks/useJsonLd';
import { organizationLd, webSiteLd } from '../utils/jsonLd';
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_TELEGRAM, CONTACT_WHATSAPP, SOCIAL_LINKS } from '../data/contacts';
import { useHomeVariant } from '../lib/homeVariant';
import { pickProducts, type QuickFilter } from '../utils/productFlags';
import { SITE_NAME, SITE_URL } from '../data/seo';
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
  useJsonLd([
    organizationLd({
      siteUrl: SITE_URL,
      logoUrl: `${SITE_URL}/logo-icon-badge.svg`,
      phone: CONTACT_PHONE,
      email: CONTACT_EMAIL,
      sameAs: [...SOCIAL_LINKS.map((s) => s.href), CONTACT_TELEGRAM, CONTACT_WHATSAPP].filter((u): u is string => Boolean(u)),
    }),
    webSiteLd(SITE_URL),
  ]);
  const { products, isLoading, error } = useProducts();
  const variant = useHomeVariant();
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('new');

  const picks = pickProducts(products, quickFilter);
  const bestWomen = products.filter((p) => p.gender === 'female' && p.isBestseller);
  const bestMen = products.filter((p) => p.gender === 'male' && p.isBestseller);

  // Bands alternate plain/alt down the page; in variant B the "Хиты" bands are dark instead.
  const hitsTone = (index: number): BandTone => (variant === 'b' ? 'dark' : alternatingTone(index));
  const showWomen = !isLoading && bestWomen.length > 0;
  const showMen = !isLoading && bestMen.length > 0;
  const womenIndex = 1;
  const menIndex = womenIndex + (showWomen ? 1 : 0);
  const recentIndex = menIndex + (showMen ? 1 : 0);

  return (
    <div className="home" data-variant={variant}>
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

      <SaleBanner products={products} isLoading={isLoading} />

      <PromoBanner placement="Home" />

      {error && (
        <p className="container home__error">
          {t('home.loadError', { error, url: API_BASE_URL })}
        </p>
      )}

      <HomeBand tone={alternatingTone(0)} className="home-band--picks">
        <QuickChips value={quickFilter} onChange={setQuickFilter} />
        <Reveal>
          <h3 className="home-section__title">{t(`home.picks.${quickFilter}`)}</h3>
        </Reveal>
        <Reveal>
          {isLoading ? (
            <div className="home__skeleton-row">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : picks.length === 0 ? (
            <p className="home__empty">{t('home.chips.empty')}</p>
          ) : (
            <Slider key={quickFilter}>
              {picks.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Slider>
          )}
        </Reveal>
      </HomeBand>

      {showWomen && (
        <HomeBand tone={hitsTone(womenIndex)}>
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
        </HomeBand>
      )}

      {showMen && (
        <HomeBand tone={hitsTone(menIndex)}>
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
        </HomeBand>
      )}

      <RecentlyViewed tone={alternatingTone(recentIndex)} />
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
