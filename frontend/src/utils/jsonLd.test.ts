import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { breadcrumbLd, organizationLd, productLd, serializeJsonLd, webSiteLd } from './jsonLd';

// The same file backend/Application.Tests/Seo/SeoRendererTests.cs checks the API's crawler pages against.
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/fixtures/jsonld/product-page.json'), 'utf8'));
const input = fixture.input;
const productUrl = `${input.siteUrl}/product/${input.productId}`;

const base = {
  id: 1,
  name: 'Платье',
  description: 'Описание',
  price: 1000,
  stock: 1,
  images: ['https://x.example/a.jpg'],
  fallbackImage: 'https://x.example/og.png',
  url: 'https://x.example/product/1',
};

describe('golden file shared with the API', () => {
  it('Product has exactly the shape the API produces', () => {
    const ld = productLd({
      id: input.productId,
      name: input.name,
      description: input.description,
      price: input.price,
      stock: input.stock,
      images: input.images,
      fallbackImage: 'unused',
      url: productUrl,
      rating: input.rating,
      reviewCount: input.reviewCount,
    });
    expect(JSON.parse(serializeJsonLd(ld))).toEqual(fixture.expected.product);
  });

  it('BreadcrumbList has exactly the shape the API produces', () => {
    const ld = breadcrumbLd([
      { name: 'Главная', url: `${input.siteUrl}/` },
      { name: input.categoryName, url: `${input.siteUrl}/catalog/${input.categorySlug}` },
      { name: input.name, url: productUrl },
    ]);
    expect(JSON.parse(serializeJsonLd(ld))).toEqual(fixture.expected.breadcrumbs);
  });
});

describe('productLd', () => {
  it('availability follows the real stock', () => {
    const offers = (stock: number) => (productLd({ ...base, stock }).offers as Record<string, unknown>).availability;
    expect(offers(5)).toBe('https://schema.org/InStock');
    expect(offers(0)).toBe('https://schema.org/OutOfStock');
  });

  it('price is a plain string in KZT, without trailing zeros', () => {
    const offer = productLd({ ...base, price: 9900.5 }).offers as Record<string, unknown>;
    expect(offer.price).toBe('9900.5');
    expect(offer.priceCurrency).toBe('KZT');
  });

  it('has no rating without reviews, and falls back to a default image without photos', () => {
    const ld = productLd({ ...base, images: [], rating: 0, reviewCount: 0 });
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.image).toEqual(['https://x.example/og.png']);
  });
});

describe('organizationLd / webSiteLd', () => {
  it('Organization carries only what is configured', () => {
    const bare = organizationLd({ siteUrl: 'https://s.kz', logoUrl: 'https://s.kz/l.svg', sameAs: [] });
    expect(bare).toEqual({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Family Shop', url: 'https://s.kz/', logo: 'https://s.kz/l.svg' });

    const full = organizationLd({
      siteUrl: 'https://s.kz',
      logoUrl: 'https://s.kz/l.svg',
      phone: '+7 700 000 00 00',
      email: 'a@b.kz',
      sameAs: ['https://instagram.com/x'],
    });
    expect(full.contactPoint).toMatchObject({ '@type': 'ContactPoint', telephone: '+7 700 000 00 00', email: 'a@b.kz' });
    expect(full.sameAs).toEqual(['https://instagram.com/x']);
  });

  it('WebSite has no SearchAction (search has no address of its own)', () => {
    const ld = webSiteLd('https://s.kz');
    expect(ld['@type']).toBe('WebSite');
    expect(ld.potentialAction).toBeUndefined();
  });
});

describe('serializeJsonLd', () => {
  const evil = '</script><script>alert(1)</script><!-- & \u2028';

  it('can never close the script block, and the value survives the round trip', () => {
    const text = serializeJsonLd(productLd({ ...base, name: evil, description: evil }));
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text).name).toBe(evil);
  });
});
