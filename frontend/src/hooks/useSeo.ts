import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_URL } from '../data/seo';

interface SeoInput {
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'product';
  /** Closed or non-existent pages: `noindex,nofollow`. Everything else is explicitly `index,follow`. */
  noindex?: boolean;
  /** Price in tenge, product pages only (product:price:* tags). */
  price?: number;
}

/** og:image must be an absolute address: a relative one is taken from the site domain. */
function absoluteImage(image: string | undefined): string {
  if (!image) return DEFAULT_OG_IMAGE;
  return image.startsWith('/') ? `${SITE_URL}${image}` : image;
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Lightweight per-page meta management for this CSR-only SPA — no
// react-helmet-async, since there's no SSR and only a handful of pages
// need dynamic tags. Tags are upserted in place; the next page's call
// simply overwrites them, so no unmount cleanup is needed.
// Crawlers that do not run JS (WhatsApp, Telegram) never see these tags - that is the bot-render step (docs/Seo.md).
// `title` is expected fully formed (e.g. "{Категория} — Family Shop").
export function useSeo({ title, description, image, type = 'website', noindex = false, price }: SeoInput) {
  const location = useLocation();

  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${location.pathname}`;
    const ogImage = absoluteImage(image);

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:locale', 'ru_RU');
    if (ogImage === DEFAULT_OG_IMAGE) {
      upsertMeta('property', 'og:image:width', String(OG_IMAGE_WIDTH));
      upsertMeta('property', 'og:image:height', String(OG_IMAGE_HEIGHT));
    } else {
      // The size of a product photo is unknown; a wrong one would be worse than none.
      removeMeta('property', 'og:image:width');
      removeMeta('property', 'og:image:height');
    }
    if (type === 'product' && price !== undefined) {
      upsertMeta('property', 'product:price:amount', String(price));
      upsertMeta('property', 'product:price:currency', 'KZT');
    } else {
      removeMeta('property', 'product:price:amount');
      removeMeta('property', 'product:price:currency');
    }
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertLink('canonical', canonicalUrl);
  }, [title, description, image, type, noindex, price, location.pathname]);
}
