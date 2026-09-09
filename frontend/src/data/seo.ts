// Placeholder production domain — reused from the footer contact
// (hello@familyshop.example). Swap for the real domain before deploy;
// it drives canonical/og:url and the static files in public/.
export const SITE_URL = 'https://familyshop.example';
export const SITE_NAME = 'Family Shop';

// No branded raster asset exists in the repo yet (only favicon.svg /
// icons.svg, and social crawlers largely ignore SVG og:image). Reusing
// the home page's "women" hero photo, cropped to the 1200x630 og:image
// ratio, as a temporary stand-in until a real brand image is designed.
export const DEFAULT_OG_IMAGE =
  'https://images.unsplash.com/photo-1662532577856-e8ee8b138a8b?w=1200&h=630&fit=crop&q=80';

export const DEFAULT_TITLE = `${SITE_NAME} — интернет-магазин одежды в Казахстане`;
export const DEFAULT_DESCRIPTION =
  'Женская, мужская и детская одежда, обувь и сумки с быстрой доставкой по Казахстану. Минимализм и качество в каждой вещи.';

export function truncateDescription(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
