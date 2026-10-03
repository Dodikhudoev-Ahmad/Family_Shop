import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPage } from './CheckoutPage';
import type { CartLine } from '../context/CartContext';

const createOrder = vi.hoisted(() => vi.fn());
const clearCart = vi.fn();
const refreshStock = vi.fn().mockResolvedValue(undefined);

let lines: CartLine[] = [
  {
    key: '7__onesize',
    size: null,
    quantity: 1,
    product: {
      id: '7', name: 'Куртка', description: '', price: 10000, stock: 1, categoryId: '1', gender: 'female',
      images: ['a.jpg'], sizes: [], isBestseller: false, createdAt: '2026-09-01T00:00:00Z', averageRating: 0, reviewCount: 0,
    },
  },
];

vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/api')>()), createOrder }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Аня' }, isLoading: false }) }));
vi.mock('../context/CartContext', () => ({
  useCart: () => ({ lines, totalPrice: 10000, finalTotal: 10000, promo: null, clearCart, refreshStock }),
}));
vi.mock('../components/PromoCodeInput/PromoCodeInput', () => ({ PromoCodeInput: () => null }));

async function reachConfirmStep() {
  render(
    <MemoryRouter>
      <CheckoutPage />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Телефон'), { target: { value: '7001234567' } });
  fireEvent.click(screen.getByText('Самовывоз'));
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
}

const originalLines = lines;
beforeEach(() => {
  vi.clearAllMocks();
  lines = originalLines;
  refreshStock.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('CheckoutPage - 409 out_of_stock', () => {
  it('shows the product name and what is left, keeps the cart, refreshes stock and does not show success', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(
      new ApiError("Insufficient stock for product 'Куртка'.", {
        status: 409,
        code: 'out_of_stock',
        meta: { productId: 7, productName: 'Куртка', available: 0 },
      })
    );

    await reachConfirmStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('«Куртка»');
    expect(alert).toHaveTextContent('закончился');
    expect(alert).not.toHaveTextContent('Insufficient');
    expect(clearCart).not.toHaveBeenCalled();
    await waitFor(() => expect(refreshStock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Заказ оформлен!')).not.toBeInTheDocument();
    expect(screen.getByText('Куртка')).toBeInTheDocument(); // the cart summary is still there
  });

  it('shows the remaining quantity when some units are left', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(
      new ApiError('x', { status: 409, code: 'out_of_stock', meta: { productId: 7, productName: 'Куртка', available: 3 } })
    );

    await reachConfirmStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('не хватает на складе, осталось 3');
  });

  it('keeps showing the server text for other failures and does not refresh stock', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(new ApiError('Промокод не найден.', { status: 400 }));

    await reachConfirmStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Промокод не найден.');
    expect(refreshStock).not.toHaveBeenCalled();
  });

  it('size_unavailable: names the product and size, keeps the cart, refreshes it and creates no order', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(
      new ApiError("Size 'L' is not available for product 'Куртка'.", {
        status: 409,
        code: 'size_unavailable',
        meta: { productId: 7, productName: 'Куртка', size: 'L' },
      })
    );

    await reachConfirmStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Размер «L» товара «Куртка» больше недоступен');
    expect(alert).not.toHaveTextContent('is not available');
    expect(clearCart).not.toHaveBeenCalled();
    await waitFor(() => expect(refreshStock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Заказ оформлен!')).not.toBeInTheDocument();
  });

  it('keeps explaining the refusal when the refreshed cart turns out empty', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(
      new ApiError('x', { status: 409, code: 'size_unavailable', meta: { productId: 7, productName: 'Куртка', size: 'L' } })
    );
    // what refreshStock does when the only line's size was withdrawn
    refreshStock.mockImplementation(() => {
      lines = [];
      return Promise.resolve();
    });

    const view = await reachConfirmStep();
    void view;
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));

    await waitFor(() => expect(screen.getByText('В корзине нет товаров для оформления.')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Размер «L» товара «Куртка» больше недоступен');
    expect(clearCart).not.toHaveBeenCalled();
  });

  it('sends an Idempotency-Key, and the same one when the same request is repeated after a refusal', async () => {
    const { ApiError } = await import('../lib/api');
    createOrder.mockRejectedValue(new ApiError('x', { status: 409, code: 'out_of_stock', meta: { productName: 'Куртка', available: 3 } }));

    await reachConfirmStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить заказ' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить заказ' }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

    const [firstKey, secondKey] = createOrder.mock.calls.map((call) => call[1]);
    expect(firstKey).toMatch(/^[A-Za-z0-9._:-]{8,100}$/);
    expect(secondKey).toBe(firstKey); // nothing changed, so the server may recognise it
    expect(createOrder.mock.calls[0][0]).toEqual(createOrder.mock.calls[1][0]);
  });
});
