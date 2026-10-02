import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminProductsPage } from './AdminProductsPage';
import type { CategoryDto, ProductDto } from '../../types/api';

const api = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProductsPage: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const categories: CategoryDto[] = [
  { id: 1, name: 'Женское', slug: 'women', parentCategoryId: null, hasSizes: true },
  { id: 2, name: 'Мужское', slug: 'men', parentCategoryId: null, hasSizes: true },
  { id: 3, name: 'Детское', slug: 'kids', parentCategoryId: null, hasSizes: true },
  { id: 4, name: 'Бытовая техника', slug: 'bytovaya-tehnika', parentCategoryId: null, hasSizes: false },
];

const product = (over: Partial<ProductDto>): ProductDto => ({
  id: 1, name: 'Товар', description: 'Описание', price: 1000, discountPrice: null, stock: 5, categoryId: 2, gender: 0,
  images: ['https://example.com/a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: null, availableSizes: null, ...over,
});

const sneakers = product({ id: 10, name: 'Кроссовки Лайт', categoryId: 2, productType: 'Кроссовки', availableSizes: ['38', '39'] });
const kidsShoes = product({ id: 11, name: 'Ботинки малыш', categoryId: 3, gender: 2, productType: 'Ботинки', availableSizes: null });
const fridge = product({ id: 12, name: 'Холодильник мини', categoryId: 4, productType: 'Холодильники', availableSizes: null });
const hoodie = product({ id: 13, name: 'Худи', categoryId: 2, productType: 'Худи', availableSizes: ['S', 'M', 'L', 'XL'] });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchCategories.mockResolvedValue(categories);
  api.fetchProductsPage.mockResolvedValue({ items: [sneakers, kidsShoes, fridge, hoodie], totalCount: 4, page: 1, pageSize: 12, hasMore: false });
  api.updateAdminProduct.mockImplementation((_id: number, request: unknown) => Promise.resolve(request));
});
afterEach(cleanup);

async function openEdit(name: string) {
  render(<AdminProductsPage />);
  const row = (await screen.findByText(name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Изменить' }));
  return screen.findByRole('group', { name: /Одежда|Обувь|Детская обувь/ }).catch(() => null);
}

const checked = () =>
  screen.queryAllByRole('checkbox').filter((c) => (c.closest('.admin-sizes__item') as HTMLElement | null) && (c as HTMLInputElement).checked).map((c) => c.nextSibling!.textContent);
const sizeBoxes = () => screen.queryAllByRole('checkbox').filter((c) => c.closest('.admin-sizes__item'));
const typeSelect = () => screen.getByLabelText('Тип товара') as HTMLSelectElement;
const categorySelect = () => screen.getByLabelText('Категория') as HTMLSelectElement;

describe('product form - sizes', () => {
  it('shows the adult shoe group with exactly the product\'s sizes ticked, and "select all" / "clear all"', async () => {
    const group = await openEdit('Кроссовки Лайт');

    expect(group).not.toBeNull();
    expect(screen.getByText('Обувь')).toBeInTheDocument();
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(['36', '37', '38', '39', '40']);
    expect(checked()).toEqual(['38', '39']);

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать все' }));
    expect(checked()).toEqual(['36', '37', '38', '39', '40']);

    fireEvent.click(screen.getByRole('button', { name: 'Снять все' }));
    expect(checked()).toEqual([]);
  });

  it('refuses to save a sized product with no size ticked', async () => {
    await openEdit('Кроссовки Лайт');
    fireEvent.click(screen.getByRole('button', { name: 'Снять все' }));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    expect(await screen.findByText('Выберите хотя бы один размер.')).toBeInTheDocument();
    expect(api.updateAdminProduct).not.toHaveBeenCalled();
  });

  it('sends the ticked sizes and the type on save', async () => {
    await openEdit('Худи');
    fireEvent.click(screen.getByLabelText('XL')); // untick XL

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ productType: 'Худи', availableSizes: ['S', 'M', 'L'] });
  });

  it('kids shoes use the children\'s grid 26-35 (all ticked when the product has no custom selection)', async () => {
    await openEdit('Ботинки малыш');

    expect(screen.getByText('Детская обувь')).toBeInTheDocument();
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(['26', '27', '28', '29', '30', '31', '32', '33', '34', '35']);
    expect(checked()).toHaveLength(10);
  });

  it('a product type without sizes shows the note, no checkboxes, and sends no sizes', async () => {
    await openEdit('Холодильник мини');

    expect(screen.getByText('Для этого типа товаров размеры не используются')).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ productType: 'Холодильники', availableSizes: null });
  });

  it('changing the type resets the sizes to the whole new grid', async () => {
    await openEdit('Кроссовки Лайт');
    expect(checked()).toEqual(['38', '39']);

    fireEvent.change(typeSelect(), { target: { value: 'Ботинки' } }); // same grid, but the selection starts over
    expect(checked()).toEqual(['36', '37', '38', '39', '40']);

    fireEvent.change(typeSelect(), { target: { value: 'Худи' } });
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(checked()).toHaveLength(7);

    fireEvent.change(typeSelect(), { target: { value: 'Сумки' } });
    expect(screen.getByText('Для этого типа товаров размеры не используются')).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);
  });

  it('changing the category clears a type it does not offer and the grid with it', async () => {
    await openEdit('Кроссовки Лайт');

    fireEvent.change(categorySelect(), { target: { value: '4' } }); // Бытовая техника

    expect(typeSelect().value).toBe('');
    expect(screen.getByText(/Выберите тип товара — появится размерная сетка/)).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);
  });

  it('moving shoes to Детское switches to the children\'s grid', async () => {
    await openEdit('Кроссовки Лайт');

    fireEvent.change(categorySelect(), { target: { value: '3' } });

    expect(typeSelect().value).toBe('Кроссовки'); // still offered there
    expect(screen.getByText('Детская обувь')).toBeInTheDocument();
    expect(checked()).toHaveLength(10);
  });

  it('a new product starts with every size of the chosen type ticked', async () => {
    render(<AdminProductsPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Добавить товар/ }))[0]);
    fireEvent.change(await screen.findByLabelText('Категория'), { target: { value: '2' } });

    fireEvent.change(typeSelect(), { target: { value: 'Худи' } });

    expect(checked()).toHaveLength(7);
  });
});

describe('products list - size summary', () => {
  it('shows a short summary per product', async () => {
    render(<AdminProductsPage />);
    await screen.findByText('Худи');

    const cellOf = (name: string) => screen.getByText(name).closest('tr')!.querySelector('.admin-products__sizes')!.textContent;
    expect(cellOf('Кроссовки Лайт')).toBe('38–39');
    expect(cellOf('Ботинки малыш')).toBe('26–35');
    expect(cellOf('Холодильник мини')).toBe('без размеров');
    expect(cellOf('Худи')).toBe('S–XL');
  });
});
