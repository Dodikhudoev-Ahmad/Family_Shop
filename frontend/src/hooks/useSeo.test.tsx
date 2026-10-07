import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OG_IMAGE, SITE_URL } from '../data/seo';
import { useSeo } from './useSeo';

type Input = Parameters<typeof useSeo>[0];

function Probe(props: Input) {
  useSeo(props);
  return null;
}

const meta = (attr: 'name' | 'property', key: string) =>
  document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)?.getAttribute('content') ?? null;
const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? null;

function mount(path: string, props: Input) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  document.head.innerHTML = '';
  document.title = '';
});

describe('useSeo', () => {
  it('home: title, description, canonical, og tags, default raster og:image, indexable', () => {
    mount('/', { title: 'Family Shop — интернет-магазин одежды в Казахстане', description: 'Описание главной' });
    expect(document.title).toBe('Family Shop — интернет-магазин одежды в Казахстане');
    expect(meta('name', 'description')).toBe('Описание главной');
    expect(canonical()).toBe(`${SITE_URL}/`);
    expect(meta('property', 'og:url')).toBe(`${SITE_URL}/`);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:image')).toBe(DEFAULT_OG_IMAGE);
    expect(DEFAULT_OG_IMAGE).toMatch(/\/og-default\.png$/);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:locale')).toBe('ru_RU');
    expect(meta('name', 'twitter:image')).toBe(DEFAULT_OG_IMAGE);
    expect(meta('name', 'robots')).toBe('index,follow');
  });

  it('category: canonical is the path on the main domain, query string is not part of it', () => {
    mount('/catalog/women?sort=price&search=пальто', { title: 'Женское — Family Shop', description: 'd' });
    expect(canonical()).toBe(`${SITE_URL}/catalog/women`);
    expect(meta('property', 'og:url')).toBe(`${SITE_URL}/catalog/women`);
    expect(meta('name', 'robots')).toBe('index,follow');
  });

  it('product: og:type product, own first photo as og:image, product price tags', () => {
    mount('/product/7', {
      title: 'Платье — 12 500 ₸ | Family Shop',
      description: 'Платье из хлопка',
      image: 'https://api.familyshop10.kz/uploads/products/abc.jpg',
      type: 'product',
      price: 12500,
    });
    expect(meta('property', 'og:type')).toBe('product');
    expect(meta('property', 'og:image')).toBe('https://api.familyshop10.kz/uploads/products/abc.jpg');
    expect(meta('name', 'twitter:image')).toBe('https://api.familyshop10.kz/uploads/products/abc.jpg');
    expect(meta('property', 'product:price:amount')).toBe('12500');
    expect(meta('property', 'product:price:currency')).toBe('KZT');
    expect(canonical()).toBe(`${SITE_URL}/product/7`);
  });

  it('a relative photo address is made absolute on the site domain', () => {
    mount('/product/7', { title: 't', description: 'd', image: '/uploads/products/abc.jpg', type: 'product' });
    expect(meta('property', 'og:image')).toBe(`${SITE_URL}/uploads/products/abc.jpg`);
  });

  it.each(['/cart', '/checkout', '/account', '/account/orders/5', '/login', '/favorites', '/admin/orders', '/no/such/page'])(
    'noindex page %s: robots noindex,nofollow',
    (path) => {
      mount(path, { title: 'Закрытая — Family Shop', description: 'd', noindex: true });
      expect(meta('name', 'robots')).toBe('noindex,nofollow');
      expect(canonical()).toBe(`${SITE_URL}${path}`);
    },
  );

  it('does not leave a product-only tag on the next page', () => {
    const { unmount } = mount('/product/7', { title: 't', description: 'd', type: 'product', price: 100 });
    unmount();
    mount('/', { title: 'h', description: 'd' });
    expect(meta('property', 'product:price:amount')).toBeNull();
    expect(meta('property', 'product:price:currency')).toBeNull();
  });

  it('switching from noindex to an indexable page resets robots; tags are updated in place, not duplicated', () => {
    const { rerender } = mount('/cart', { title: 'a', description: 'd', noindex: true });
    expect(meta('name', 'robots')).toBe('noindex,nofollow');
    rerender(
      <MemoryRouter initialEntries={['/cart']}>
        <Probe title="b" description="d2" />
      </MemoryRouter>,
    );
    expect(meta('name', 'robots')).toBe('index,follow');
    expect(document.title).toBe('b');
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
});
