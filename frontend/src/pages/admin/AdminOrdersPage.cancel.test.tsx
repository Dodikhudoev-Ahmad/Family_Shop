import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminOrdersPage } from './AdminOrdersPage';
import { ALLOWED_NEXT_STATUSES } from '../../components/StatusBadge/StatusBadge';
import type { AdminOrderDto, ApiOrderStatus } from '../../lib/api';

const api = vi.hoisted(() => ({
  fetchAdminOrders: vi.fn(),
  fetchAdminOrderStats: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const order = (id: number, status: ApiOrderStatus): AdminOrderDto => ({
  id, status, totalPrice: 5000, createdAt: '2026-10-04T08:00:00Z', contactName: 'Айгуль', contactPhone: '+77001112233',
  deliveryMethod: 0, city: 'Алматы', address: 'ул. Абая 1', itemsCount: 1, items: [], promoCode: null, discountAmount: 0,
});

const selectFor = (id: number) => screen.getByLabelText(`Изменить статус заказа FS-${id}`) as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAdminOrderStats.mockResolvedValue({ ordersToday: 0, revenueToday: 0, newOrdersCount: 0, totalOrders: 3, storeTimeZone: 'Asia/Almaty' });
  api.fetchAdminOrders.mockResolvedValue({ items: [order(1, 0), order(2, 2), order(3, 3)], totalCount: 3, page: 1, pageSize: 10 });
  api.updateAdminOrderStatus.mockImplementation((id: number, status: ApiOrderStatus) => Promise.resolve(order(id, status)));
});
afterEach(cleanup);

describe('transition map', () => {
  it('lets every open status be cancelled and nothing leave Delivered or Cancelled', () => {
    for (const open of [0, 1, 2] as const) expect(ALLOWED_NEXT_STATUSES[open]).toContain(4);
    expect(ALLOWED_NEXT_STATUSES[3]).toEqual([]);
    expect(ALLOWED_NEXT_STATUSES[4]).toEqual([]);
  });
});

describe('cancelling from the admin orders page', () => {
  it('offers "cancelled" for a shipped order, and none for a delivered one', async () => {
    render(<AdminOrdersPage />);
    await screen.findByLabelText('Изменить статус заказа FS-2');

    expect(Array.from(selectFor(2).options).map((o) => o.value)).toContain('4');
    expect(screen.queryByLabelText('Изменить статус заказа FS-3')).toBeNull();
  });

  it('asks first, sends nothing until confirmed, then cancels the shipped order', async () => {
    render(<AdminOrdersPage />);
    await screen.findByLabelText('Изменить статус заказа FS-2');

    fireEvent.change(selectFor(2), { target: { value: '4' } });
    expect(await screen.findByText('Остаток вернётся на склад. Отмену нельзя откатить.')).toBeTruthy();
    expect(api.updateAdminOrderStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Отменить заказ' }));
    await waitFor(() => expect(api.updateAdminOrderStatus).toHaveBeenCalledWith(2, 4));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does nothing when the admin backs out', async () => {
    render(<AdminOrdersPage />);
    await screen.findByLabelText('Изменить статус заказа FS-2');

    fireEvent.change(selectFor(2), { target: { value: '4' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Не отменять' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.updateAdminOrderStatus).not.toHaveBeenCalled();
  });

  it('moves forward without a prompt', async () => {
    render(<AdminOrdersPage />);
    await screen.findByLabelText('Изменить статус заказа FS-1');

    fireEvent.change(selectFor(1), { target: { value: '1' } });
    await waitFor(() => expect(api.updateAdminOrderStatus).toHaveBeenCalledWith(1, 1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
