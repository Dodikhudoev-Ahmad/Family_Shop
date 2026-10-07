import { resolveSiteUrl } from '../lib/siteUrl';

// VITE_SITE_URL drives canonical / og:url / og:image here and the matching %VITE_SITE_URL% tags in index.html.
// A production build without it (or with the old placeholder) fails in vite.config.ts; see lib/siteUrl.ts.
export const SITE_URL = resolveSiteUrl(import.meta.env.VITE_SITE_URL, import.meta.env.PROD);
export const SITE_NAME = 'Family Shop';

/** Default og:image: a raster 1200x630 card (brand palette + logo) in public/. SVG is not rendered by messenger crawlers. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

export function truncateDescription(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
