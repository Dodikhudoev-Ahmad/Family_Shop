import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SaleBanner } from './SaleBanner';
import type { Product } from '../../types/product';

const product = (id: string, price: number, discountPrice?: number, images: string[] = [`/img/${id}.jpg`]): Product => ({
  id,
  name: `Товар ${id}`,
  description: '',
  price,
  discountPrice,
  stock: 5,
  categoryId: '1',
  gender: 'female',
  images,
  sizes: [],
  createdAt: '2026-01-01T00:00:00Z',
  averageRating: 0,
  reviewCount: 0,
});

const renderBanner = (products: Product[], isLoading = false) =>
  render(
    <MemoryRouter>
      <SaleBanner products={products} isLoading={isLoading} />
    </MemoryRouter>
  );

const cards = (c: HTMLElement) => [...c.querySelectorAll<HTMLImageElement>('.sale-banner__card img')];

afterEach(cleanup);

describe('sale banner collage', () => {
  const many = [
    product('a', 1000, 800), // −20%
    product('b', 1000, 300), // −70%
    product('c', 1000), // no discount
    product('d', 1000, 600), // −40%
    product('e', 1000, 900), // −10%
  ];

  it('shows the three products with the biggest discount, biggest first', () => {
    const { container } = renderBanner(many);
    expect(cards(container).map((i) => i.getAttribute('src'))).toEqual(['/img/b.jpg', '/img/d.jpg', '/img/a.jpg']);
    expect(container.querySelector('.sale-banner__collage')).toHaveAttribute('data-count', '3');
  });

  it('says "до −N%" with the same biggest discount as the first card', () => {
    const { container } = renderBanner(many);
    expect(screen.getByText('до −70%')).toBeInTheDocument();
    expect(container.querySelector('.sale-banner__card')).toHaveTextContent('−70%');
  });

  it('shows two cards for two discounted products', () => {
    const { container } = renderBanner([product('a', 1000, 500), product('b', 1000, 900), product('c', 1000)]);
    expect(cards(container)).toHaveLength(2);
    expect(container.querySelector('.sale-banner__collage')).toHaveAttribute('data-count', '2');
  });

  it('shows a single card for a single discounted product', () => {
    const { container } = renderBanner([product('a', 1000, 500), product('b', 1000)]);
    expect(cards(container)).toHaveLength(1);
    expect(container.querySelector('.sale-banner__collage')).toHaveAttribute('data-count', '1');
  });

  it('is hidden when nothing is discounted', () => {
    const { container } = renderBanner([product('a', 1000), product('b', 2000)]);
    expect(container.querySelector('.sale-banner')).toBeNull();
    expect(screen.queryByText('Сезонная распродажа')).not.toBeInTheDocument();
  });

  it('keeps the text and button, without a collage, when the discounted products have no photo', () => {
    const { container } = renderBanner([product('a', 1000, 500, [])]);
    expect(screen.getByText('до −50%')).toBeInTheDocument();
    expect(container.querySelector('.sale-banner__collage')).toBeNull();
  });

  it('draws only a skeleton while loading', () => {
    const { container } = renderBanner(many, true);
    expect(container.querySelector('.sale-banner--loading')).not.toBeNull();
    expect(cards(container)).toHaveLength(0);
  });
});

describe('sale banner markup', () => {
  it('has a "Смотреть" link to the discounted catalog', () => {
    renderBanner([product('a', 1000, 500)]);
    const banner = screen.getByRole('region', { name: 'Сезонная распродажа' });
    expect(within(banner).getByRole('link', { name: /Смотреть/ })).toHaveAttribute('href', '/catalog?discount=true');
  });

  it('photos are lazy, sized (no layout jump) and decorative (empty alt)', () => {
    const { container } = renderBanner([product('a', 1000, 500), product('b', 1000, 400)]);
    for (const img of cards(container)) {
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
      expect(img).toHaveAttribute('alt', '');
    }
  });

  it('decorative SVGs are hidden from assistive technology', () => {
    const { container } = renderBanner([product('a', 1000, 500)]);
    const svgs = [...container.querySelectorAll('.sale-banner__decor')];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
