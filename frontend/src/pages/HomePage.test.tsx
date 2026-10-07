import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import type { Product } from '../types/product';

const state = vi.hoisted(() => ({ products: [] as Product[], isLoading: false, recent: [] as string[] }));
vi.mock('../context/ProductsContext', () => ({
  useProducts: () => ({ products: state.products, isLoading: state.isLoading, error: null }),
}));
vi.mock('../context/CategoriesContext', () => ({ useCategories: () => ({ categories: [] }) }));
vi.mock('../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../context/QuickViewContext', () => ({ useQuickView: () => ({ open: vi.fn() }) }));
vi.mock('../context/RecentlyViewedContext', () => ({ useRecentlyViewed: () => ({ recentIds: state.recent }) }));
vi.mock('../components/PromoBanner/PromoBanner', () => ({ PromoBanner: () => null }));
vi.mock('../hooks/useInView', () => ({ useInView: () => ({ ref: { current: null }, isVisible: true }) }));

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id,
  name: `Товар ${id}`,
  description: '',
  price: 10000,
  stock: 5,
  categoryId: '1',
  gender: 'female',
  images: ['a.jpg'],
  sizes: [],
  createdAt: daysAgo(200),
  averageRating: 0,
  reviewCount: 0,
  ...over,
});

const renderHome = (url = '/') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <HomePage />
    </MemoryRouter>
  );

beforeAll(() => {
  Element.prototype.scrollBy = vi.fn() as unknown as typeof Element.prototype.scrollBy;
});
beforeEach(() => {
  sessionStorage.clear();
  state.isLoading = false;
  state.recent = [];
  state.products = [
    product('1', { name: 'Платье свежее', createdAt: daysAgo(2) }),
    product('2', { name: 'Куртка со скидкой', discountPrice: 5000 }),
    product('3', { name: 'Пальто хит', isBestseller: true, gender: 'female' }),
    product('4', { name: 'Рубашка хит', isBestseller: true, gender: 'male' }),
  ];
});
afterEach(cleanup);

const bands = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.home-band')];

describe('home page: sale banner', () => {
  it('shows the biggest real discount and a "Смотреть" button to the discounted catalog', () => {
    renderHome();
    expect(screen.getByText('Сезонная распродажа')).toBeInTheDocument();
    expect(screen.getByText('до −50%')).toBeInTheDocument();
    const banner = screen.getByRole('region', { name: 'Сезонная распродажа' });
    expect(within(banner).getByRole('link', { name: /Смотреть/ })).toHaveAttribute('href', '/catalog?discount=true');
  });

  it('is not drawn when nothing is discounted', () => {
    state.products = state.products.map((p) => ({ ...p, discountPrice: undefined }));
    renderHome();
    expect(screen.queryByText('Сезонная распродажа')).not.toBeInTheDocument();
  });
});

describe('home page: quick filter chips', () => {
  it('starts on "Новинки" and shows only recent products', () => {
    renderHome();
    expect(screen.getByRole('button', { name: 'Новинки' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Новинки недели' })).toBeInTheDocument();
    const picks = document.querySelector('.home-band--picks') as HTMLElement;
    expect(within(picks).getByText('Платье свежее')).toBeInTheDocument();
    expect(within(picks).queryByText('Куртка со скидкой')).not.toBeInTheDocument();
  });

  it('"Скидки" shows discounted products and badges them', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Скидки' }));
    expect(screen.getByRole('button', { name: 'Скидки' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Новинки' })).toHaveAttribute('aria-pressed', 'false');
    const picks = document.querySelector('.home-band--picks') as HTMLElement;
    expect(within(picks).getByText('Куртка со скидкой')).toBeInTheDocument();
    expect(within(picks).getByText('−50%')).toBeInTheDocument();
    expect(within(picks).queryByText('Платье свежее')).not.toBeInTheDocument();
  });

  it('"Хиты" shows bestsellers with the hit badge', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Хиты' }));
    const picks = document.querySelector('.home-band--picks') as HTMLElement;
    expect(within(picks).getByText('Пальто хит')).toBeInTheDocument();
    expect(within(picks).getAllByText('Хит продаж').length).toBe(2);
  });

  it('says so when a chip has no products', () => {
    state.products = [product('9')];
    renderHome();
    expect(screen.getByText('Пока здесь нет товаров')).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    state.isLoading = true;
    state.products = [];
    renderHome();
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});

describe('home page: variants', () => {
  it('A: bands alternate plain/alt, none is dark', () => {
    const { container } = renderHome('/?variant=a');
    expect(container.querySelector('.home')).toHaveAttribute('data-variant', 'a');
    const tones = bands(container).map((b) => b.dataset.tone);
    expect(tones).toEqual(['alt', 'plain', 'alt']);
  });

  it('B: the "Хиты" bands are dark, the rest unchanged', () => {
    const { container } = renderHome('/?variant=b');
    expect(container.querySelector('.home')).toHaveAttribute('data-variant', 'b');
    const all = bands(container);
    expect(all.map((b) => b.dataset.tone)).toEqual(['alt', 'dark', 'dark']);
    expect(within(all[1]).getByText('Пальто хит')).toBeInTheDocument();
    expect(within(all[2]).getByText('Рубашка хит')).toBeInTheDocument();
  });

  it('falls back to A for an unknown value', () => {
    const { container } = renderHome('/?variant=zzz');
    expect(container.querySelector('.home')).toHaveAttribute('data-variant', 'a');
  });

  it('keeps alternating after the hits bands when there are recently viewed products', () => {
    state.recent = ['1'];
    const { container } = renderHome('/?variant=a');
    expect(bands(container).map((b) => b.dataset.tone)).toEqual(['alt', 'plain', 'alt', 'plain']);
  });
});
