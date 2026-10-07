/** Where the site is opened during development and tests when VITE_SITE_URL is not set. */
export const DEV_SITE_URL = 'http://localhost:5173';

/** The address that used to stand in for the real domain; it must never reach a production build. */
const PLACEHOLDER_HOST = 'familyshop.example';

const HINT = 'Задайте VITE_SITE_URL в окружении сборки, например https://www.familyshop10.kz (без / в конце).';

/**
 * The public address of the site (canonical, og:url, og:image), from the VITE_SITE_URL build variable only.
 * Production: the variable is required and must be an http(s) address that is not the old placeholder, otherwise
 * the build fails with a readable message. Elsewhere (dev server, tests) a missing value falls back to the local address.
 * A trailing slash is dropped (paths are appended with a leading one). Pure: no import.meta, so vite.config.ts can use it.
 */
export function resolveSiteUrl(raw: unknown, isProduction: boolean): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    if (isProduction) throw new Error(`VITE_SITE_URL не задан. ${HINT}`);
    return DEV_SITE_URL;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    if (isProduction) throw new Error(`VITE_SITE_URL не похож на адрес: «${text}». ${HINT}`);
    return DEV_SITE_URL;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    if (isProduction) throw new Error(`VITE_SITE_URL должен начинаться с http:// или https://: «${text}». ${HINT}`);
    return DEV_SITE_URL;
  }
  if (url.hostname === PLACEHOLDER_HOST) {
    if (isProduction) throw new Error(`VITE_SITE_URL всё ещё содержит заглушку ${PLACEHOLDER_HOST}. ${HINT}`);
    return DEV_SITE_URL;
  }
  return text.replace(/\/+$/, '');
}
