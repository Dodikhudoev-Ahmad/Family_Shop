import { SITE_NAME } from '../data/seo';

/**
 * schema.org structured data (docs/Seo.md, "JSON-LD"). The Product and BreadcrumbList objects have the same shape as the
 * ones the API puts on its crawler pages (backend/Api/Seo/JsonLd.cs); both are checked against
 * docs/fixtures/jsonld/product-page.json. Everything here is plain data: it is turned into text only by `serializeJsonLd`.
 */
export type JsonLdObject = Record<string, unknown>;

export interface Crumb {
  name: string;
  url: string;
}

export interface ProductLdInput {
  id: string | number;
  name: string;
  description: string;
  /** Price in tenge after discount. */
  price: number;
  stock: number;
  /** Absolute photo addresses. */
  images: string[];
  /** Used when there is no photo at all. */
  fallbackImage: string;
  url: string;
  rating?: number;
  reviewCount?: number;
}

/** A price as a string without trailing zeros: 12500, 9900.5 (the same as the API's `0.##`). */
const amount = (value: number) => String(Math.round(value * 100) / 100);

export function productLd(p: ProductLdInput): JsonLdObject {
  const data: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description,
    sku: String(p.id),
    brand: { '@type': 'Brand', name: SITE_NAME },
    url: p.url,
    image: p.images.length > 0 ? p.images : [p.fallbackImage],
    offers: {
      '@type': 'Offer',
      url: p.url,
      price: amount(p.price),
      priceCurrency: 'KZT',
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  if (p.rating !== undefined && p.reviewCount !== undefined && p.reviewCount > 0) {
    data.aggregateRating = { '@type': 'AggregateRating', ratingValue: amount(p.rating), reviewCount: p.reviewCount };
  }
  return data;
}

export function breadcrumbLd(crumbs: Crumb[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

export interface OrganizationLdInput {
  siteUrl: string;
  logoUrl: string;
  phone?: string;
  email?: string;
  /** Social networks and messengers the shop really has (empty ones are not passed). */
  sameAs: string[];
}

/** Organization: contactPoint only when a phone or an e-mail is configured, sameAs only when there are links - nothing is invented. */
export function organizationLd(o: OrganizationLdInput): JsonLdObject {
  const data: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${o.siteUrl}/`,
    logo: o.logoUrl,
  };
  if (o.phone || o.email) {
    data.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      areaServed: 'KZ',
      availableLanguage: ['ru', 'kk', 'en'],
      ...(o.phone ? { telephone: o.phone } : {}),
      ...(o.email ? { email: o.email } : {}),
    };
  }
  if (o.sameAs.length > 0) data.sameAs = o.sameAs;
  return data;
}

/** WebSite. No SearchAction: search on the site is an overlay with no address of its own that a crawler could open. */
export function webSiteLd(siteUrl: string): JsonLdObject {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${siteUrl}/` };
}

/**
 * The text placed inside <script type="application/ld+json">. JSON.stringify leaves `<`, `>` and `&` as they are, so
 * `</script>` in a product name would end the block; they (and the line separators U+2028/2029) are written as \uXXXX,
 * which is the same value for a JSON parser.
 */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
