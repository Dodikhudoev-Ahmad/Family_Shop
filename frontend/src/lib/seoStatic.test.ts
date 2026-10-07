import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = (rel: string) => readFileSync(resolve(process.cwd(), rel)) // vitest runs from frontend/;
const text = (rel: string) => file(rel).toString('utf8');

describe('index.html', () => {
  const html = text('index.html');

  it('uses the raster og card for og:image and twitter:image, with its size, on the site domain', () => {
    expect(html).toContain('<meta property="og:image" content="%VITE_SITE_URL%/og-default.png" />');
    expect(html).toContain('<meta name="twitter:image" content="%VITE_SITE_URL%/og-default.png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).not.toMatch(/(og|twitter):image"[^>]*\.svg/);
  });

  it('has canonical on the site variable, is indexable by default and has no placeholder host', () => {
    expect(html).toContain('<link rel="canonical" href="%VITE_SITE_URL%/" />');
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).not.toMatch(/familyshop\.example/);
  });
});

describe('public/og-default.png', () => {
  it('is a real PNG of 1200x630', () => {
    const png = file('public/og-default.png');
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(300 * 1024);
  });
});

describe('public/robots.txt', () => {
  const lines = text('public/robots.txt')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));

  it('closes the admin, checkout and account, names the sitemap on the main domain, allows the rest', () => {
    expect(lines).toEqual([
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /checkout',
      'Disallow: /account',
      'Sitemap: https://www.familyshop10.kz/sitemap.xml',
    ]);
  });

  it('does not forbid pages that rely on the noindex tag (a crawler could not read it)', () => {
    for (const path of ['/cart', '/login', '/favorites']) expect(lines).not.toContain(`Disallow: ${path}`);
  });
});
