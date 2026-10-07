import { describe, expect, it } from 'vitest';
import { DEV_SITE_URL, resolveSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('returns the canonical address without a trailing slash', () => {
    expect(resolveSiteUrl('https://www.familyshop10.kz', true)).toBe('https://www.familyshop10.kz');
    expect(resolveSiteUrl('  https://www.familyshop10.kz/// ', true)).toBe('https://www.familyshop10.kz');
  });

  it('fails a production build with a readable message when the variable is missing or blank', () => {
    expect(() => resolveSiteUrl(undefined, true)).toThrow(/VITE_SITE_URL/);
    expect(() => resolveSiteUrl('   ', true)).toThrow(/не задан/);
  });

  it('fails a production build for an unreadable address, a non-http scheme or the old placeholder', () => {
    expect(() => resolveSiteUrl('www.familyshop10.kz', true)).toThrow(/VITE_SITE_URL/);
    expect(() => resolveSiteUrl('ftp://www.familyshop10.kz', true)).toThrow(/http/);
    expect(() => resolveSiteUrl('https://familyshop.example', true)).toThrow(/заглушк/);
  });

  it('falls back to the local address outside production (also for the old placeholder)', () => {
    expect(resolveSiteUrl(undefined, false)).toBe(DEV_SITE_URL);
    expect(resolveSiteUrl('', false)).toBe(DEV_SITE_URL);
    expect(resolveSiteUrl('https://familyshop.example', false)).toBe(DEV_SITE_URL);
    expect(resolveSiteUrl('https://www.familyshop10.kz/', false)).toBe('https://www.familyshop10.kz');
  });
});
