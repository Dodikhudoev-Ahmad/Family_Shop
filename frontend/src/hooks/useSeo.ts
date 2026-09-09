import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_OG_IMAGE, SITE_URL } from '../data/seo';

interface SeoInput {
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'product';
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
// `title` is expected fully formed (e.g. "{Категория} — Family Shop").
export function useSeo({ title, description, image, type = 'website' }: SeoInput) {
  const location = useLocation();

  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${location.pathname}`;
    const ogImage = image ?? DEFAULT_OG_IMAGE;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertLink('canonical', canonicalUrl);
  }, [title, description, image, type, location.pathname]);
}
