import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPage } from './ProductPage';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../types/product';
import type { ProductDto } from '../types/api';

const fetchProduct = vi.hoisted(() => vi.fn());
const addItem = vi.fn();
let catalogue: Product[] = [];

vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/api')>()), fetchProduct }));
vi.mock('../context/ProductsContext', () => ({ useProducts: () => ({ products: catalogue, isLoading: false, error: null }) }));
vi.mock('../context/CategoriesContext', () => ({ useCategories: () => ({ categories, isLoading: false }) }));
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
  { id: '6', name: 'Спортивные товары', slug: 'sport', hasSizes: false },
];

// "Foto MU": sport category (no sizes, no gender of its own), gender 1, no size grid.
const foto = (over: Partial<ProductDto> = {}): ProductDto => ({
  id: 307, name: 'Foto MU', description: 'Описание', price: 5000, discountPrice: null, stock: 12, categoryId: 6, gender: 1,
  images: ['a.jpg'], createdAt: '2026-10-03T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: 'Экипировка', availableSizes: null, ...over,
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/product/:id" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  catalogue = [];
});
afterEach(cleanup);

describe('ProductPage - a product that is not in the catalogue loaded at start', () => {
  it('asks the API for it by id instead of saying "not found" (a product added after the app was opened)', async () => {
    fetchProduct.mockResolvedValue(foto());

    renderAt('/product/307');

    expect(screen.queryByText('Товар не найден.')).not.toBeInTheDocument(); // loading, not a verdict
    expect(await screen.findByRole('heading', { name: 'Foto MU' })).toBeInTheDocument();
    expect(fetchProduct).toHaveBeenCalledWith(307);
    expect(screen.queryByText('Товар не найден.')).not.toBeInTheDocument();
  });

  it('works for a product with no size grid and no type (gender 1 in a category without a gender)', async () => {
    fetchProduct.mockResolvedValue(foto({ productType: null }));

    renderAt('/product/307');

    expect(await screen.findByRole('heading', { name: 'Foto MU' })).toBeInTheDocument();
    expect(document.querySelector('.product-page__sizes')).toBeNull();
    const add = screen.getByRole('button', { name: 'В корзину' });
    expect(add).not.toHaveAttribute('aria-disabled');
    fireEvent.click(add);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '307', productType: undefined }), null, 1);
  });

  it('says "not found" only when the API does not know the id either', async () => {
    fetchProduct.mockRejectedValue(new Error('404'));

    renderAt('/product/99999');

    expect(await screen.findByText('Товар не найден.')).toBeInTheDocument();
  });

  it('does not ask the API for something that is not a product id', async () => {
    renderAt('/product/abc');

    expect(await screen.findByText('Товар не найден.')).toBeInTheDocument();
    expect(fetchProduct).not.toHaveBeenCalled();
  });

  it('uses the catalogue when the product is there (no extra request)', async () => {
    catalogue = [mapProduct(foto(), categories)];

    renderAt('/product/307');

    expect(await screen.findByRole('heading', { name: 'Foto MU' })).toBeInTheDocument();
    await waitFor(() => expect(fetchProduct).not.toHaveBeenCalled());
  });
});
