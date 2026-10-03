import { describe, expect, it } from 'vitest';
import { DEV_API_BASE_URL, resolveApiBaseUrl } from './config';

describe('resolveApiBaseUrl', () => {
  it('uses VITE_API_URL', () => {
    expect(resolveApiBaseUrl({ VITE_API_URL: 'https://api.familyshop10.kz/api/v1' })).toBe('https://api.familyshop10.kz/api/v1');
  });

  it('prefers VITE_API_URL over the earlier VITE_API_BASE_URL, which still works on its own', () => {
    expect(resolveApiBaseUrl({ VITE_API_URL: 'https://new.example/api/v1', VITE_API_BASE_URL: 'https://old.example/api/v1' })).toBe('https://new.example/api/v1');
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://old.example/api/v1' })).toBe('https://old.example/api/v1');
  });

  it('falls back to the local API when nothing is set (also for blank values), and drops a trailing slash', () => {
    expect(resolveApiBaseUrl({})).toBe(DEV_API_BASE_URL);
    expect(resolveApiBaseUrl({ VITE_API_URL: '  ', VITE_API_BASE_URL: '' })).toBe(DEV_API_BASE_URL);
    expect(resolveApiBaseUrl({ VITE_API_URL: 'https://api.familyshop10.kz/api/v1/' })).toBe('https://api.familyshop10.kz/api/v1');
  });
});

describe('no hosting address is written into the code', () => {
  // Every source / style / locale file of the app (tests excluded), read as text at build time.
  const sources = import.meta.glob(['../**/*.{ts,tsx,css,json}', '!../**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const statics = import.meta.glob(['../../index.html', '../../public/robots.txt', '../../public/sitemap.xml'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('has no Railway address in the source, the locale texts or the connection-error message', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50); // the glob really found the app
    const offenders = Object.entries(sources).filter(([, text]) => /railway\.app/i.test(text)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('the page, robots.txt and sitemap.xml name the canonical domain, not the Railway one', () => {
    expect(Object.keys(statics)).toHaveLength(3);
    for (const text of Object.values(statics)) expect(text).not.toMatch(/railway\.app/i);
    expect(statics['../../public/sitemap.xml']).toContain('https://www.familyshop10.kz/');
    expect(statics['../../public/robots.txt']).toContain('Sitemap: https://www.familyshop10.kz/sitemap.xml');
  });
});
