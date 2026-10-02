import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPage } from './ProductPage';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../types/product';
import type { ProductDto } from '../types/api';

const addItem = vi.fn();
let catalogue: Product[] = [];

vi.mock('../context/ProductsContext', () => ({ useProducts: () => ({ products: catalogue, isLoading: false, error: null }) }));
vi.mock('../context/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
      { id: '4', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
    ],
    isLoading: false,
  }),
}));
vi.mock('../context/CartContext', () => ({ useCart: () => ({ lines: [], addItem, remainingStock: (p: Product) => p.stock }) }));
vi.mock('../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../context/RecentlyViewedContext', () => ({ useRecentlyViewed: () => ({ addViewed: vi.fn(), viewedIds: [] }) }));
vi.mock('../components/RecentlyViewed/RecentlyViewed', () => ({ RecentlyViewed: () => null }));
vi.mock('../components/Reviews/ProductReviews', () => ({ ProductReviews: () => null }));
vi.mock('../components/ProductCard/ProductCard', () => ({ ProductCard: () => null }));
vi.mock('../components/Slider/Slider', () => ({ Slider: () => null }));

const categories = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '4', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
];

const dto = (over: Partial<ProductDto>): ProductDto => ({
  id: 7, name: 'Худи оверсайз', description: 'Описание', price: 9000, discountPrice: null, stock: 5, categoryId: 1, gender: 1,
  images: ['a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: 'Худи', availableSizes: null, ...over,
});

const renderPage = (product: ProductDto) => {
  catalogue = [mapProduct(product, categories)];
  return render(
    <MemoryRouter initialEntries={[`/product/${product.id}`]}>
      <Routes>
        <Route path="/product/:id" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
};

const sizeButtons = () => [...document.querySelectorAll('.product-page__sizes .size-btn')].map((b) => b.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ProductPage - sizes', () => {
  it('offers only the sizes the admin sells', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));

    expect(sizeButtons()).toEqual(['M', 'L']);
  });

  it('offers the whole grid of the type when no selection was made (existing products)', () => {
    renderPage(dto({ availableSizes: null }));

    expect(sizeButtons()).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
  });

  it('asks for a size before adding, then adds with exactly that size', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));

    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }), 'L', 1);
  });

  it('shows no size selector for a product without sizes, and adds it without a size', () => {
    renderPage(dto({ id: 8, name: 'Холодильник', categoryId: 4, productType: 'Холодильники' }));

    expect(document.querySelector('.product-page__sizes')).toBeNull();
    expect(screen.queryByText('Размер')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '8' }), null, 1);
  });
});
