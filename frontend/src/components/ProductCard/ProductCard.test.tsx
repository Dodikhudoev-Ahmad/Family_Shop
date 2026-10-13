import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Product } from '../../types/product';

vi.mock('../../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../../context/QuickViewContext', () => ({ useQuickView: () => ({ open: vi.fn() }) }));
vi.mock('../../context/CategoriesContext', () => ({ useCategories: () => ({ categories: [] }) }));

const product = (over: Partial<Product> = {}): Product => ({
  id: '1',
  name: 'Кроссовки детские',
  description: '',
  price: 10000,
  stock: 10,
  categoryId: '3',
  gender: 'kids',
  images: ['a.jpg'],
  sizes: [],
  isBestseller: false,
  createdAt: '2026-09-01T00:00:00Z',
  averageRating: 0,
  reviewCount: 0,
  ...over,
});

const renderCard = (p: Product) =>
  render(
    <MemoryRouter>
      <ProductCard product={p} />
    </MemoryRouter>
  );

afterEach(cleanup);

describe('ProductCard badges', () => {
  it('shows no "Хит продаж" for a regular product', () => {
    renderCard(product());
    expect(screen.queryByText('Хит продаж')).not.toBeInTheDocument();
  });

  it('shows "Хит продаж" for a bestseller', () => {
    renderCard(product({ isBestseller: true }));
    expect(screen.getByText('Хит продаж')).toBeInTheDocument();
  });

  it('shows both badges, in one stacked container, for a discounted bestseller', () => {
    renderCard(product({ isBestseller: true, discountPrice: 8000 }));
    const hit = screen.getByText('Хит продаж');
    const discount = screen.getByText('−20%');
    expect(hit.parentElement).toBe(discount.parentElement);
    expect(hit.parentElement).toHaveClass('product-card__badges');
  });

  it('prefers the out-of-stock badge over hit/discount', () => {
    renderCard(product({ isBestseller: true, discountPrice: 8000, stock: 0 }));
    expect(screen.getByText('Нет в наличии')).toBeInTheDocument();
    expect(screen.queryByText('Хит продаж')).not.toBeInTheDocument();
  });
});

describe('ProductCard "Новинка" badge', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('shows for a product added recently', () => {
    renderCard(product({ createdAt: daysAgo(3) }));
    expect(screen.getByText('Новинка')).toBeInTheDocument();
  });

  it('is absent for an old product', () => {
    renderCard(product({ createdAt: daysAgo(90) }));
    expect(screen.queryByText('Новинка')).not.toBeInTheDocument();
  });

  it('stacks with the discount and hit badges in one container', () => {
    renderCard(product({ createdAt: daysAgo(1), isBestseller: true, discountPrice: 8000 }));
    const badges = screen.getByText('Новинка').parentElement;
    expect(badges).toHaveClass('product-card__badges');
    expect(badges).toContainElement(screen.getByText('−20%'));
    expect(badges).toContainElement(screen.getByText('Хит продаж'));
  });

  it('is replaced by "Нет в наличии" for a product that is out of stock', () => {
    renderCard(product({ createdAt: daysAgo(1), stock: 0 }));
    expect(screen.queryByText('Новинка')).not.toBeInTheDocument();
  });
});

describe('ProductCard shoe audience', () => {
  const shoe = (over: Partial<Product> = {}) =>
    product({ shoeSegment: 'kids', childGender: 'boy', gridSizes: ['27', '28', '36', '37'], ...over });

  it('shows who kids shoes are for and the size range from the server grid', () => {
    renderCard(shoe());
    expect(screen.getByText('Мальчикам')).toBeInTheDocument();
    expect(screen.getByText('EU 27–37')).toBeInTheDocument();
  });

  it('marks teen shoes with the boy/girl', () => {
    renderCard(shoe({ shoeSegment: 'teen', childGender: 'girl', gridSizes: ['37', '38', '41'] }));
    expect(screen.getByText('Подросткам (д)')).toBeInTheDocument();
    expect(screen.getByText('EU 37–41')).toBeInTheDocument();
  });

  it('shows nothing extra for adult shoes and other products', () => {
    renderCard(shoe({ shoeSegment: 'men', childGender: undefined }));
    expect(screen.queryByText(/EU /)).not.toBeInTheDocument();
    cleanup();
    renderCard(product());
    expect(screen.queryByText(/EU /)).not.toBeInTheDocument();
  });
});
