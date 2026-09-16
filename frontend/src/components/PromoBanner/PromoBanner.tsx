import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchActivePromoBanners, type PromoBannerDto } from '../../lib/api';
import './PromoBanner.css';

export function PromoBanner() {
  const [banner, setBanner] = useState<PromoBannerDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActivePromoBanners()
      .then((banners) => {
        if (!cancelled) setBanner(banners[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setBanner(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner) return null;

  const isInternalLink = banner.buttonLink?.startsWith('/');

  return (
    <section className="promo-banner container">
      <div
        className="promo-banner__card"
        style={banner.imageUrl ? { backgroundImage: `url(${banner.imageUrl})` } : undefined}
      >
        {banner.imageUrl && <div className="promo-banner__overlay" />}
        <div className="promo-banner__content">
          <h2 className="promo-banner__title">{banner.title}</h2>
          {banner.subtitle && <p className="promo-banner__subtitle">{banner.subtitle}</p>}
          {banner.buttonText &&
            banner.buttonLink &&
            (isInternalLink ? (
              <Link to={banner.buttonLink} className="promo-banner__cta">
                {banner.buttonText}
                <ArrowRight />
              </Link>
            ) : (
              <a href={banner.buttonLink} className="promo-banner__cta" target="_blank" rel="noopener noreferrer">
                {banner.buttonText}
                <ArrowRight />
              </a>
            ))}
        </div>
      </div>
    </section>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="promo-banner__arrow">
      <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
