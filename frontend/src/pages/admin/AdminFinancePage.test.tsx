import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminFinancePage } from './AdminFinancePage';
import { ApiError, type FinanceEntryDto, type FinanceSummaryDto } from '../../lib/api';
import { setStoreTimeZone, storeTodayIso } from '../../utils/storeTime';

const api = vi.hoisted(() => ({
  fetchFinanceSummary: vi.fn(),
  fetchFinanceChart: vi.fn(),
  fetchFinanceJournal: vi.fn(),
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  downloadFinanceExport: vi.fn(),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
const media = vi.hoisted(() => ({ mobile: false }));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => media.mobile }));

const summary = (over: Partial<FinanceSummaryDto> = {}): FinanceSummaryDto => ({
  period: 'month', dateFrom: '2026-10-01', dateTo: '2026-10-04', income: 150_000, reversals: 10_000, expenses: 40_000,
  balance: 100_000, incomeCount: 3, expenseCount: 2, storeTimeZone: 'Asia/Almaty', ...over,
});

const months = Array.from({ length: 12 }, (_, i) => ({
  month: `${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`,
  income: i === 11 ? 150_000 : 0, reversals: 0, expenses: i === 11 ? 40_000 : 0, balance: 0,
}));

const entry = (over: Partial<FinanceEntryDto>): FinanceEntryDto => ({
  kind: 'Income', id: 1, date: '2026-10-04T08:00:00Z', amount: 50_000, orderId: 12, category: null, comment: null, author: null, isDeleted: false, deletedAt: null, ...over,
});

const entries = [
  entry({ kind: 'Income', id: 1, orderId: 12, amount: 50_000 }),
  entry({ kind: 'Reversal', id: 2, orderId: 9, amount: 7_000 }),
  entry({ kind: 'Expense', id: 3, orderId: null, amount: 3_000, category: 'Delivery', comment: 'Курьер до склада', author: 'Админ' }),
];

const digits = (el: HTMLElement) => (el.textContent ?? '').replace(/\D/g, '');
const card = (key: string) => screen.getByTestId(`fin-card-${key}`);
const tomorrow = () => {
  const [y, m, d] = storeTodayIso().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

beforeEach(() => {
  vi.clearAllMocks();
  media.mobile = false;
  api.fetchFinanceSummary.mockResolvedValue(summary());
  api.fetchFinanceChart.mockResolvedValue({ storeTimeZone: 'Asia/Almaty', months });
  api.fetchFinanceJournal.mockResolvedValue({ items: entries, totalCount: 3, page: 1, pageSize: 10 });
  api.createExpense.mockResolvedValue(entry({ kind: 'Expense', id: 9 }));
  api.deleteExpense.mockResolvedValue(entry({ kind: 'Expense', id: 3, isDeleted: true, deletedAt: '2026-10-04T09:00:00Z' }));
  api.downloadFinanceExport.mockResolvedValue({ blob: new Blob(['x']), fileName: 'finance_2026-10-01_2026-10-04.xlsx' });
});
afterEach(() => {
  cleanup();
  setStoreTimeZone(undefined);
});

describe('summary', () => {
  it('shows income, reversals, expenses and the balance of the month by default', async () => {
    render(<AdminFinancePage />);

    await waitFor(() => expect(digits(card('income'))).toContain('150000'));
    expect(api.fetchFinanceSummary).toHaveBeenCalledWith('month', '', '');
    expect(digits(card('reversals'))).toContain('10000');
    expect(digits(card('expenses'))).toContain('40000');
    expect(digits(card('balance'))).toContain('100000');
    expect(card('income').textContent).toContain('3 заказ');
    expect(screen.getByTestId('fin-period').textContent).toMatch(/01.*—.*04/);
  });

  it('marks a negative balance', async () => {
    api.fetchFinanceSummary.mockResolvedValue(summary({ income: 0, reversals: 0, expenses: 5_000, balance: -5_000 }));
    render(<AdminFinancePage />);

    await waitFor(() => expect(card('balance').textContent).toMatch(/5\s?000/));
    expect(card('balance').querySelector('.is-negative')).not.toBeNull();
  });

  it('asks again for each preset period', async () => {
    render(<AdminFinancePage />);
    await waitFor(() => expect(api.fetchFinanceSummary).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: 'Сегодня' }));
    await waitFor(() => expect(api.fetchFinanceSummary).toHaveBeenLastCalledWith('today', '', ''));
    fireEvent.click(screen.getByRole('tab', { name: 'Неделя' }));
    await waitFor(() => expect(api.fetchFinanceSummary).toHaveBeenLastCalledWith('week', '', ''));
    expect(screen.getByRole('tab', { name: 'Неделя' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows the error when the summary cannot be loaded', async () => {
    api.fetchFinanceSummary.mockRejectedValue(new ApiError('Нет связи'));
    render(<AdminFinancePage />);

    expect(await screen.findByText('Нет связи')).toBeTruthy();
  });
});

describe('custom period', () => {
  const openCustom = async () => {
    render(<AdminFinancePage />);
    await waitFor(() => expect(api.fetchFinanceSummary).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Период' }));
  };

  it('waits for both dates and sends nothing until then', async () => {
    await openCustom();

    expect(screen.getByText('Выберите обе даты периода.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Период: от'), { target: { value: '2026-10-01' } });
    expect(api.fetchFinanceSummary).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Период: до'), { target: { value: '2026-10-03' } });
    await waitFor(() => expect(api.fetchFinanceSummary).toHaveBeenLastCalledWith('custom', '2026-10-01', '2026-10-03'));
  });

  it('refuses a reversed or over-long range on the spot', async () => {
    await openCustom();

    fireEvent.change(screen.getByLabelText('Период: от'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Период: до'), { target: { value: '2026-10-01' } });
    expect(await screen.findByText(/позже/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Период: от'), { target: { value: '2024-01-01' } });
    fireEvent.change(screen.getByLabelText('Период: до'), { target: { value: '2026-01-01' } });
    expect(await screen.findByText(/366/)).toBeTruthy();
    expect(api.fetchFinanceSummary).toHaveBeenCalledTimes(1);
  });
});

describe('chart', () => {
  it('draws twelve months with a readable label each', async () => {
    render(<AdminFinancePage />);

    const chart = await screen.findByRole('list', { name: 'Приход и расходы по месяцам' });
    const columns = within(chart).getAllByRole('listitem');
    expect(columns).toHaveLength(12);
    const last = columns[11].getAttribute('aria-label') ?? '';
    expect(last).toContain('приход');
    expect((last.match(/\d/g) ?? []).join('')).toContain('150000');
  });

  it('says so when there is no money movement yet', async () => {
    api.fetchFinanceChart.mockResolvedValue({ storeTimeZone: 'Asia/Almaty', months: months.map((m) => ({ ...m, income: 0, expenses: 0 })) });
    render(<AdminFinancePage />);

    expect(await screen.findByText('Движения денег пока нет')).toBeTruthy();
  });
});

describe('journal', () => {
  it('lists payments and expenses with signs, and the details of an expense', async () => {
    render(<AdminFinancePage />);

    expect(await screen.findByText('Заказ FS-12')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/\+\s*50/);
    expect(rows[1].textContent).toMatch(/−\s*7/);
    expect(rows[1].textContent).toContain('Заказ FS-9');
    expect(rows[2].textContent).toMatch(/−\s*3/);
    expect(rows[2].textContent).toContain('Доставка');
    expect(rows[2].textContent).toContain('Курьер до склада');
    expect(rows[2].textContent).toContain('Админ');
  });

  it('shows the same on a phone, as cards', async () => {
    media.mobile = true;
    render(<AdminFinancePage />);

    expect(await screen.findByText('Курьер до склада')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('filters by kind and goes back to the first page', async () => {
    api.fetchFinanceJournal.mockResolvedValue({ items: entries, totalCount: 25, page: 1, pageSize: 10 });
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await waitFor(() => expect(api.fetchFinanceJournal).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));

    fireEvent.click(screen.getByRole('tab', { name: 'Сторно' }));
    await waitFor(() => expect(api.fetchFinanceJournal).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'Reversal', page: 1 })));
  });

  it('sends the date filter, and none at all for an invalid one', async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');
    const before = api.fetchFinanceJournal.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Журнал: от'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Журнал: до'), { target: { value: '2026-10-01' } });
    expect(await screen.findByText(/позже/)).toBeTruthy();
    const afterFrom = api.fetchFinanceJournal.mock.calls.length;
    expect(afterFrom).toBeGreaterThan(before); // the half-set range ("from" only) was valid and was sent
    expect(api.fetchFinanceJournal.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ dateFrom: '2026-10-05' }));
    expect(api.fetchFinanceJournal.mock.calls.every((c) => !(c[0].dateFrom === '2026-10-05' && c[0].dateTo === '2026-10-01'))).toBe(true);
  });

  it('explains an empty journal', async () => {
    api.fetchFinanceJournal.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10 });
    render(<AdminFinancePage />);

    expect(await screen.findByText('Записей пока нет')).toBeTruthy();
  });

  it('shows a journal error', async () => {
    api.fetchFinanceJournal.mockRejectedValue(new ApiError('Сервер недоступен'));
    render(<AdminFinancePage />);

    expect(await screen.findByText('Сервер недоступен')).toBeTruthy();
  });
});

describe('deleting an expense', () => {
  const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;

  it('offers deletion for expenses only - never for an income or a reversal', async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');

    expect(screen.getAllByRole('button', { name: /Удалить расход/ })).toHaveLength(1);
    expect(within(rowOf('Заказ FS-12')).queryByRole('button', { name: /Удалить/ })).toBeNull();
    expect(within(rowOf('Заказ FS-9')).queryByRole('button', { name: /Удалить/ })).toBeNull();
    expect(within(rowOf('Доставка')).getByRole('button', { name: 'Удалить расход 3' })).toBeTruthy();
  });

  it('asks first, in the page (no confirm()), and sends nothing until confirmed', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');

    fireEvent.click(screen.getByRole('button', { name: 'Удалить расход 3' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Удалить расход?')).toBeTruthy();
    expect(dialog.textContent).toMatch(/Доставка/);
    expect(dialog.textContent).toMatch(/3\s?000/);
    expect(api.deleteExpense).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
    nativeConfirm.mockRestore();
  });

  it('backs out without a request', async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');

    fireEvent.click(screen.getByRole('button', { name: 'Удалить расход 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Не удалять' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.deleteExpense).not.toHaveBeenCalled();
  });

  it('deletes after confirmation, thanks, and reloads the summary, the chart and the journal', async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');
    const summaryCalls = api.fetchFinanceSummary.mock.calls.length;
    const chartCalls = api.fetchFinanceChart.mock.calls.length;
    const journalCalls = api.fetchFinanceJournal.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Удалить расход 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(api.deleteExpense).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast.showToast).toHaveBeenCalledWith('Расход удалён');
    await waitFor(() => expect(api.fetchFinanceSummary.mock.calls.length).toBeGreaterThan(summaryCalls));
    expect(api.fetchFinanceChart.mock.calls.length).toBeGreaterThan(chartCalls);
    expect(api.fetchFinanceJournal.mock.calls.length).toBeGreaterThan(journalCalls);
  });

  it('shows the server\'s reason and refreshes when the deletion fails', async () => {
    api.deleteExpense.mockRejectedValue(new ApiError('Расход не найден.', { status: 404, code: 'not_found' }));
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');

    fireEvent.click(screen.getByRole('button', { name: 'Удалить расход 3' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(toast.showToast).toHaveBeenCalledWith('Расход не найден.', 'error'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers the same on a phone, in the cards', async () => {
    media.mobile = true;
    render(<AdminFinancePage />);
    await screen.findByText('Курьер до склада');

    expect(screen.getAllByRole('button', { name: /Удалить расход/ })).toHaveLength(1);
  });
});

describe('deleted expenses in the journal', () => {
  const withDeleted = [
    ...entries,
    entry({ kind: 'Expense', id: 4, orderId: null, amount: 8_000, category: 'Other', comment: 'не тот', author: 'Админ', isDeleted: true, deletedAt: '2026-10-04T09:00:00Z' }),
  ];

  it('are hidden until asked for: the journal is requested without them, then with them', async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');
    expect(api.fetchFinanceJournal).toHaveBeenLastCalledWith(expect.objectContaining({ includeDeleted: false }));

    api.fetchFinanceJournal.mockResolvedValue({ items: withDeleted, totalCount: 4, page: 1, pageSize: 10 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать удалённые' }));

    await waitFor(() => expect(api.fetchFinanceJournal).toHaveBeenLastCalledWith(expect.objectContaining({ includeDeleted: true, page: 1 })));
  });

  it('are greyed, marked "Удалён", dated, and cannot be deleted again', async () => {
    api.fetchFinanceJournal.mockResolvedValue({ items: withDeleted, totalCount: 4, page: 1, pageSize: 10 });
    render(<AdminFinancePage />);

    const row = (await screen.findByText('не тот')).closest('tr') as HTMLElement;
    expect(row.className).toContain('fin-row--deleted');
    expect(within(row).getByText('Удалён')).toBeTruthy();
    expect(row.textContent).toMatch(/Удалён\s.*2026/);
    expect(within(row).queryByRole('button', { name: /Удалить/ })).toBeNull();
    expect(row.textContent).toMatch(/−\s*8/);
    // the live expense next to it still can
    expect(screen.getAllByRole('button', { name: /Удалить расход/ })).toHaveLength(1);
  });

  it('count as a journal filter: with the switch on and nothing found, the empty state mentions filters', async () => {
    api.fetchFinanceJournal.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10 });
    render(<AdminFinancePage />);
    await screen.findByText('Записей пока нет');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать удалённые' }));

    expect(await screen.findByText('По этим фильтрам записей нет')).toBeTruthy();
  });
});

describe('adding an expense', () => {
  const open = async () => {
    render(<AdminFinancePage />);
    await screen.findByText('Заказ FS-12');
    fireEvent.click(screen.getByRole('button', { name: '+ Расход' }));
    return screen.findByRole('dialog');
  };
  const amountInput = () => screen.getByPlaceholderText('15000');
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  it('opens with today (in the shop) as the date and "Закупка" selected', async () => {
    await open();

    expect((screen.getByLabelText('Дата') as HTMLInputElement).value).toBe(storeTodayIso());
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('Purchase');
  });

  it.each([
    ['', 'Укажите сумму.'],
    ['0', 'Сумма должна быть больше нуля.'],
    ['12.5', 'Сумма — целое число тенге.'],
    ['-100', 'Сумма — целое число тенге.'],
    ['1000000001', 'Сумма слишком большая.'],
  ])('refuses the amount %j without calling the API', async (amount, message) => {
    await open();

    fireEvent.change(amountInput(), { target: { value: amount } });
    save();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(api.createExpense).not.toHaveBeenCalled();
  });

  it('refuses a date in the future', async () => {
    await open();

    fireEvent.change(amountInput(), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: tomorrow() } });
    save();

    expect(await screen.findByText('Дата расхода не может быть в будущем.')).toBeTruthy();
    expect(api.createExpense).not.toHaveBeenCalled();
  });

  it('sends the expense, closes, thanks, and reloads the figures', async () => {
    await open();
    const summaryCalls = api.fetchFinanceSummary.mock.calls.length;
    const chartCalls = api.fetchFinanceChart.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'Delivery' } });
    fireEvent.change(amountInput(), { target: { value: '15 000' } });
    fireEvent.change(screen.getByPlaceholderText('Необязательно'), { target: { value: '  Курьер  ' } });
    save();

    await waitFor(() =>
      expect(api.createExpense).toHaveBeenCalledWith({ category: 'Delivery', amount: 15_000, date: storeTodayIso(), comment: 'Курьер' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.showToast).toHaveBeenCalledWith('Расход добавлен');
    await waitFor(() => expect(api.fetchFinanceSummary.mock.calls.length).toBeGreaterThan(summaryCalls));
    expect(api.fetchFinanceChart.mock.calls.length).toBeGreaterThan(chartCalls);
  });

  it('leaves out an empty comment', async () => {
    await open();

    fireEvent.change(amountInput(), { target: { value: '500' } });
    save();

    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, comment: undefined })));
  });

  it('keeps the form open and shows what the server said', async () => {
    api.createExpense.mockRejectedValue(new ApiError('Сумма слишком большая.'));
    await open();

    fireEvent.change(amountInput(), { target: { value: '500' } });
    save();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('closes on Escape and on "Отмена"', async () => {
    await open();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '+ Расход' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.createExpense).not.toHaveBeenCalled();
  });
});

describe('Excel export', () => {
  const createUrl = vi.fn(() => 'blob:finance');
  const revokeUrl = vi.fn();

  beforeEach(() => {
    createUrl.mockClear();
    revokeUrl.mockClear();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  });

  it('downloads the period that is on screen, as a file named after it', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AdminFinancePage />);
    await waitFor(() => expect(digits(card('income'))).toContain('150000'));

    fireEvent.click(screen.getByRole('button', { name: 'Скачать Excel' }));

    await waitFor(() => expect(api.downloadFinanceExport).toHaveBeenCalledWith('2026-10-01', '2026-10-04'));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createUrl).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:finance');
    click.mockRestore();
  });

  it('is unavailable until the figures of the period are known', async () => {
    api.fetchFinanceSummary.mockReturnValue(new Promise(() => {}));
    render(<AdminFinancePage />);

    expect((screen.getByRole('button', { name: 'Скачать Excel' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server\'s reason when the file cannot be made', async () => {
    api.downloadFinanceExport.mockRejectedValue(new ApiError('За выбранный период больше 20000 записей.', { status: 400, code: 'too_many_rows' }));
    render(<AdminFinancePage />);
    await waitFor(() => expect(digits(card('income'))).toContain('150000'));

    fireEvent.click(screen.getByRole('button', { name: 'Скачать Excel' }));

    await waitFor(() => expect(toast.showToast).toHaveBeenCalledWith('За выбранный период больше 20000 записей.', 'error'));
  });
});
