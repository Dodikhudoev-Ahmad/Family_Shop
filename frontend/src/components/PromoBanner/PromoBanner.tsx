import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchActivePromoBanners, type ApiPromoBannerPlacement, type PromoBannerDto } from '../../lib/api';
import './PromoBanner.css';

const ROTATION_INTERVAL_MS = 6000;
const PLACEMENT: Record<'Home' | 'Cart', ApiPromoBannerPlacement> = { Home: 0, Cart: 1 };

interface PromoBannerProps {
  placement: 'Home' | 'Cart';
}

export function PromoBanner({ placement }: PromoBannerProps) {
  const [banners, setBanners] = useState<PromoBannerDto[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setActiveIndex(0);
    fetchActivePromoBanners(PLACEMENT[placement])
      .then((result) => {
        if (!cancelled) setBanners(result);
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % banners.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[activeIndex];
  const isInternalLink = banner.buttonLink?.startsWith('/');
  // buttonLink is admin-supplied; block "javascript:"/"data:" etc. so a malicious or
  // compromised admin account can't turn this into a click-to-execute XSS link for
  // every storefront visitor.
  const isSafeExternalLink = !isInternalLink && banner.buttonLink && /^https?:\/\//i.test(banner.buttonLink);

  return (
    <section className="promo-banner container">
      <div
        className={`promo-banner__card${!banner.imageUrl ? ' promo-banner__card--fallback' : ''}`}
        style={banner.imageUrl ? { backgroundImage: `url(${banner.imageUrl})` } : undefined}
      >
        <div className="promo-banner__overlay" />
        <div className="promo-banner__content">
          <h2 className="promo-banner__title">{banner.title}</h2>
          {banner.subtitle && <p className="promo-banner__subtitle">{banner.subtitle}</p>}
          {banner.buttonText && banner.buttonLink && isInternalLink && (
            <Link to={banner.buttonLink} className="promo-banner__cta">
              {banner.buttonText}
              <ArrowRight />
            </Link>
          )}
          {banner.buttonText && banner.buttonLink && isSafeExternalLink && (
            <a href={banner.buttonLink} className="promo-banner__cta" target="_blank" rel="noopener noreferrer">
              {banner.buttonText}
              <ArrowRight />
            </a>
          )}
        </div>

        {banners.length > 1 && (
          <div className="promo-banner__dots" role="tablist" aria-label="Другие баннеры">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Баннер ${i + 1}`}
                className={`promo-banner__dot ${i === activeIndex ? 'is-active' : ''}`}
                onClick={() => setActiveIndex(i)}
              />
            ))}
          </div>
        )}
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
