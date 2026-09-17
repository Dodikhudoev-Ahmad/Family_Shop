// TODO: production domain. Set VITE_SITE_URL in the deploy environment
// (falls back to the familyshop.example placeholder if unset) - it drives
// canonical/og:url here and the matching %VITE_SITE_URL% tags in index.html.
// public/robots.txt and public/sitemap.xml are static files Vite doesn't
// template, so they carry their own TODO markers and need updating by hand.
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://familyshop.example';
export const SITE_NAME = 'Family Shop';

// TODO: no branded raster photo exists yet. public/logo-icon-badge.svg (hanger
// mark + wordmark on the accent color, 1200x630) is a temporary stand-in -
// swap for a real lifestyle/product photo before launch. Note most social
// crawlers (Facebook/LinkedIn in particular) don't render SVG og:image at
// all, so this placeholder may just show as a blank preview until replaced.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo-icon-badge.svg`;

export const DEFAULT_TITLE = `${SITE_NAME} — интернет-магазин одежды в Казахстане`;
export const DEFAULT_DESCRIPTION =
  'Женская, мужская и детская одежда, обувь и сумки с быстрой доставкой по Казахстану. Минимализм и качество в каждой вещи.';

export function truncateDescription(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
