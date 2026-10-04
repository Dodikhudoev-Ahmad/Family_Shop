import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminOrdersPage } from './AdminOrdersPage';

const api = vi.hoisted(() => ({
  fetchAdminOrders: vi.fn(),
  fetchAdminOrderStats: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const cardOf = (label: string) => screen.getByText(label).closest('.admin-stats__card') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAdminOrders.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10 });
});
afterEach(cleanup);

describe('dashboard cards of the orders page', () => {
  it('has "Новых сегодня" (placed today) and "Доставлено сегодня" (delivered today), and no more "Заказов сегодня"', async () => {
    api.fetchAdminOrderStats.mockResolvedValue({
      ordersToday: 2, revenueToday: 102_800, newOrdersCount: 4, totalOrders: 30, newToday: 7, storeTimeZone: 'Asia/Almaty',
    });
    render(<AdminOrdersPage />);

    await waitFor(() => expect(cardOf('Новых сегодня').textContent).toContain('7'));
    expect(cardOf('Доставлено сегодня').textContent).toContain('2');
    expect((cardOf('Выручка сегодня').textContent ?? '').replace(/\D/g, '')).toContain('102800');
    expect(cardOf('Новых заказов').textContent).toContain('4');
    expect(cardOf('Всего заказов').textContent).toContain('30');
    expect(screen.queryByText('Заказов сегодня')).toBeNull();
    expect(document.querySelectorAll('.admin-stats__card')).toHaveLength(5);
  });

  it('shows 0 for "Новых сегодня" when an older server does not send it yet', async () => {
    api.fetchAdminOrderStats.mockResolvedValue({ ordersToday: 1, revenueToday: 5000, newOrdersCount: 0, totalOrders: 3, storeTimeZone: 'Asia/Almaty' });
    render(<AdminOrdersPage />);

    await waitFor(() => expect(cardOf('Доставлено сегодня').textContent).toContain('1'));
    expect(cardOf('Новых сегодня').textContent).toContain('0');
  });
});
