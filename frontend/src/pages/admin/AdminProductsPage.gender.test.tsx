import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminProductsPage } from './AdminProductsPage';
import type { CategoryDto, ProductDto } from '../../types/api';

const api = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProductsPage: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  uploadAdminProductImage: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const categories: CategoryDto[] = [
  { id: 1, name: 'Женское', slug: 'women', parentCategoryId: null, hasSizes: true },
  { id: 4, name: 'Бытовая техника', slug: 'bytovaya-tehnika', parentCategoryId: null, hasSizes: false },
  { id: 5, name: 'Посуда', slug: 'posuda', parentCategoryId: null, hasSizes: false },
  { id: 6, name: 'Новинки сезона', slug: 'new-season', parentCategoryId: null, hasSizes: true },
  { id: 7, name: 'Дом и быт', slug: 'dom-i-byt', parentCategoryId: null, hasSizes: false },
];

const product = (over: Partial<ProductDto>): ProductDto => ({
  id: 1, name: 'Товар', description: 'Описание', price: 1000, discountPrice: null, stock: 5, categoryId: 4, gender: 1,
  images: ['https://example.com/a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: null, availableSizes: null, ...over,
});

const kettle = product({ id: 20, name: 'Чайник электрический', categoryId: 4, gender: 1, productType: 'Чайники' });
const mug = product({ id: 21, name: 'Кружка', categoryId: 5, gender: 2, productType: 'Кружки и чашки' });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchCategories.mockResolvedValue(categories);
  api.fetchProductsPage.mockResolvedValue({ items: [kettle, mug], totalCount: 2, page: 1, pageSize: 12, hasMore: false });
  api.updateAdminProduct.mockImplementation((_id: number, request: unknown) => Promise.resolve(request));
  api.uploadAdminProductImage.mockResolvedValue('https://example.com/new.jpg');
  api.createAdminProduct.mockImplementation((request: unknown) => Promise.resolve(request));
});
afterEach(cleanup);

const categorySelect = () => screen.getByLabelText('Категория') as HTMLSelectElement;
const genderField = () => screen.queryByLabelText('Пол');

async function openEdit(name: string) {
  render(<AdminProductsPage />);
  const row = (await screen.findByText(name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Изменить' }));
  await screen.findByLabelText('Категория');
}

describe('product form - gender field', () => {
  it('is hidden for appliances and tableware', async () => {
    await openEdit('Чайник электрический');
    expect(genderField()).not.toBeInTheDocument();

    fireEvent.change(categorySelect(), { target: { value: '5' } });
    expect(genderField()).not.toBeInTheDocument();
  });

  it('is hidden for "Дом и быт", which offers only its own types and no sizes', async () => {
    await openEdit('Чайник электрический');
    fireEvent.change(categorySelect(), { target: { value: '7' } });
    expect(genderField()).not.toBeInTheDocument();

    const typeOptions = within(screen.getByLabelText('Тип товара')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(typeOptions).toEqual(expect.arrayContaining(['Этажерки', 'Органайзеры', 'Системы хранения', 'Декор']));
    expect(typeOptions).not.toContain('Холодильники');

    fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: 'Этажерки' } });
    expect(screen.getByText('Для этого типа товаров размеры не используются')).toBeInTheDocument();
  });

  it('is shown for a category with sizes that has no gender of its own', async () => {
    await openEdit('Чайник электрический');
    fireEvent.change(categorySelect(), { target: { value: '6' } });
    expect(genderField()).toBeInTheDocument();
  });

  it('keeps the stored gender of an edited product while the field is hidden', async () => {
    await openEdit('Чайник электрический');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ categoryId: 4, gender: 1 });
  });

  it('sends the default gender 0 for a new product in a category without the field', async () => {
    render(<AdminProductsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Добавить товар|Новый товар/ }));
    await screen.findByLabelText('Категория');

    fireEvent.change(categorySelect(), { target: { value: '1' } }); // women implies gender 1
    fireEvent.change(categorySelect(), { target: { value: '4' } });
    expect(genderField()).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Тостер' } });
    fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: 'Тостеры' } });
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Описание' } });
    fireEvent.change(screen.getByLabelText('Цена, ₸'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Остаток на складе'), { target: { value: '3' } });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadAdminProductImage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    await waitFor(() => expect(api.createAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.createAdminProduct.mock.calls[0][0]).toMatchObject({ categoryId: 4, gender: 0 });
  });
});
