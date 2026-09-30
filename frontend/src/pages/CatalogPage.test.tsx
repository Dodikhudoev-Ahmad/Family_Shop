import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPage } from './CatalogPage';
import type { Category, Product } from '../types/product';

const categories: Category[] = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '2', name: 'Мужское', slug: 'men', hasSizes: true },
  { id: '7', name: 'Посуда', slug: 'posuda', hasSizes: false },
];

const batch = (categoryId: string, productType: string, n: number, sizes: string[], price: number): Product[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${categoryId}-${productType}-${i}`,
    name: `${productType} ${i}`,
    description: '',
    price: price + i,
    stock: 5,
    categoryId,
    gender: 'female',
    images: ['a.jpg'],
    sizes,
    isBestseller: false,
    createdAt: '2026-09-01T00:00:00Z',
    averageRating: 0,
    reviewCount: 0,
    productType,
  }));

const catalog: Product[] = [
  ...batch('1', 'Платья', 6, ['S', 'M'], 8000),
  ...batch('1', 'Ботинки', 6, ['36', '37'], 15000),
  ...batch('2', 'Кроссовки', 6, ['36', '37'], 14000),
  ...batch('2', 'Худи', 6, ['S', 'M'], 9000),
  ...batch('7', 'Тарелки', 6, [], 1500),
  ...batch('7', 'Кружки', 6, [], 900),
];

const fetchProductsPage = vi.fn();

vi.mock('../context/CategoriesContext', () => ({ useCategories: () => ({ categories, isLoading: false }) }));
vi.mock('../context/ProductsContext', () => ({ useProducts: () => ({ products: catalog, isLoading: false, error: null }) }));
vi.mock('../lib/api', () => ({ fetchProductsPage: (q: unknown) => fetchProductsPage(q) }));
vi.mock('../components/ProductCard/ProductCard', () => ({ ProductCard: ({ product }: { product: Product }) => <div>{product.name}</div> }));

function Path() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Path />
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:slug" element={<CatalogPage />} />
      </Routes>
    </MemoryRouter>
  );

// Desktop sidebar and the mobile sheet render the same panel - the first one is enough.
const sidebar = () => document.querySelector('.catalog__sidebar') as HTMLElement;
const group = (title: string) =>
  within(sidebar()).getByText(title, { selector: 'h4' }).closest('.filter-panel__group') as HTMLElement;
const chipsOf = (title: string) => within(group(title)).getAllByRole('button').map((b) => b.textContent);
const lastQuery = () => fetchProductsPage.mock.calls.at(-1)![0];

beforeEach(() => {
  fetchProductsPage.mockImplementation(async (q: { categoryId?: number; productType?: string }) => {
    const items = catalog.filter(
      (p) => (!q.categoryId || p.categoryId === String(q.categoryId)) && (!q.productType || p.productType === q.productType)
    );
    return {
      items: items.map((p) => ({ ...p, categoryId: Number(p.categoryId), gender: 1, productType: p.productType ?? null, images: p.images })),
      page: 1,
      pageSize: 8,
      hasMore: false,
      totalCount: items.length,
    };
  });
});
afterEach(() => {
  cleanup();
  fetchProductsPage.mockReset();
});

describe('CatalogPage: changing the category from the filter panel', () => {
  it('navigates, and drops the type and size of the previous category', async () => {
    renderAt('/catalog/women');
    expect(chipsOf('Тип')).toEqual(['Все', 'Ботинки', 'Платья']);

    fireEvent.click(within(group('Тип')).getByRole('button', { name: 'Ботинки' }));
    await screen.findByText('Ботинки 0');
    expect(lastQuery()).toMatchObject({ categoryId: 1, productType: 'Ботинки' });
    fireEvent.click(within(group('Размер')).getByRole('button', { name: '36' }));

    fireEvent.click(within(group('Категория')).getByRole('button', { name: 'Посуда' }));

    // The URL, the title and the type list all follow - there is one source of truth.
    expect(screen.getByTestId('path')).toHaveTextContent('/catalog/posuda');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Посуда');
    expect(chipsOf('Тип')).toEqual(['Все', 'Кружки', 'Тарелки']);
    expect(within(group('Тип')).getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sidebar()).queryByText('Размер', { selector: 'h4' })).not.toBeInTheDocument();

    // The request for the new category carries no leftover type, and the list isn't empty.
    expect(await screen.findByText('Тарелки 0')).toBeInTheDocument();
    expect(lastQuery().productType).toBeUndefined();
    expect(lastQuery().categoryId).toBe(7);
    expect(screen.queryByText(/Товары не найдены/)).not.toBeInTheDocument();
    expect(fetchProductsPage.mock.calls.some(([q]) => q.categoryId === 7 && q.productType === 'Ботинки')).toBe(false);
  });

  it('"Все" leaves the shop-wide view with no type block and no leftover filter', async () => {
    renderAt('/catalog/men');
    fireEvent.click(within(group('Тип')).getByRole('button', { name: 'Кроссовки' }));
    await screen.findByText('Кроссовки 0');

    fireEvent.click(within(group('Категория')).getByRole('button', { name: 'Все' }));

    expect(screen.getByTestId('path')).toHaveTextContent(/^\/catalog$/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Каталог');
    expect(within(sidebar()).queryByText('Тип', { selector: 'h4' })).not.toBeInTheDocument();
    await screen.findByText('Платья 0');
    expect(lastQuery().productType).toBeUndefined();
    expect(lastQuery().categoryId).toBeUndefined();
  });

  it('resets the price window to the new category, not the old narrowed one', async () => {
    renderAt('/catalog/women');
    const [from] = within(group('Цена')).getAllByRole('slider');
    fireEvent.change(from, { target: { value: '15000' } });
    expect(within(group('Цена')).getByText(/15\s000/)).toBeInTheDocument();

    fireEvent.click(within(group('Категория')).getByRole('button', { name: 'Посуда' }));

    const values = group('Цена').querySelector('.price-slider__values')!.textContent!.replace(/\s/g, '');
    expect(values).toContain('900');
    expect(values).toContain('1505'); // the dishes' own span, not women's 15000-range
    expect(await screen.findByText('Тарелки 0')).toBeInTheDocument();
    expect(lastQuery().minPrice).toBeUndefined();
    expect(lastQuery().maxPrice).toBeUndefined();
  });
});
