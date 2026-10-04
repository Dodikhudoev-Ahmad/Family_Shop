import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpense, downloadFinanceExport, fetchFinanceChart, fetchFinanceJournal, fetchFinanceSummary } from './api';
import { setAccessToken } from './authToken';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, errors: [] }), { status: 200 });

describe('finance API client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    setAccessToken('access-token-1');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  const urlOf = (call = 0) => String(fetchMock.mock.calls[call][0]);
  const initOf = (call = 0) => fetchMock.mock.calls[call][1] as RequestInit;

  it('asks for a preset period without dates, even if stale custom dates are around', async () => {
    fetchMock.mockResolvedValue(ok({}));

    await fetchFinanceSummary('week', '2026-10-01', '2026-10-02');

    expect(urlOf()).toMatch(/\/admin\/finance\/summary\?period=week$/);
    expect(new Headers(initOf().headers).get('Authorization')).toBe('Bearer access-token-1');
  });

  it('sends both days for a custom period', async () => {
    fetchMock.mockResolvedValue(ok({}));

    await fetchFinanceSummary('custom', '2026-10-01', '2026-10-04');

    expect(new URL(urlOf()).searchParams.toString()).toBe('period=custom&dateFrom=2026-10-01&dateTo=2026-10-04');
  });

  it('builds the journal query from the filter, leaving out what is not set', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok({ items: [], totalCount: 0, page: 1, pageSize: 10 }))); // a Response body is read once

    await fetchFinanceJournal({ kind: 'Reversal', dateFrom: '2026-10-01', page: 2, pageSize: 10 });
    await fetchFinanceJournal();

    expect(new URL(urlOf(0)).searchParams.toString()).toBe('kind=Reversal&dateFrom=2026-10-01&page=2&pageSize=10');
    expect(urlOf(1)).toMatch(/\/admin\/finance\/journal$/);
  });

  it('reads the chart', async () => {
    fetchMock.mockResolvedValue(ok({ storeTimeZone: 'Asia/Almaty', months: [] }));

    expect(await fetchFinanceChart()).toEqual({ storeTimeZone: 'Asia/Almaty', months: [] });
    expect(urlOf()).toMatch(/\/admin\/finance\/chart$/);
  });

  it('posts an expense as JSON', async () => {
    fetchMock.mockResolvedValue(ok({ id: 1 }));

    await createExpense({ category: 'Delivery', amount: 900, date: '2026-10-04', comment: 'Курьер' });

    expect(initOf().method).toBe('POST');
    expect(JSON.parse(String(initOf().body))).toEqual({ category: 'Delivery', amount: 900, date: '2026-10-04', comment: 'Курьер' });
  });

  it('downloads the workbook and names the file after the period', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 }));

    const { blob, fileName } = await downloadFinanceExport('2026-10-01', '2026-10-04');

    expect(new URL(urlOf()).searchParams.toString()).toBe('dateFrom=2026-10-01&dateTo=2026-10-04');
    expect(fileName).toBe('finance_2026-10-01_2026-10-04.xlsx');
    expect(blob.size).toBe(4);
  });

  it('refreshes the session once when the download is refused with 401, then retries', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(ok({ accessToken: 'access-token-2' })) // /auth/refresh
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200 }));

    const { blob } = await downloadFinanceExport('2026-10-01', '2026-10-04');

    expect(urlOf(1)).toMatch(/\/auth\/refresh$/);
    expect(new Headers(initOf(2).headers).get('Authorization')).toBe('Bearer access-token-2');
    expect(blob.size).toBe(2);
  });

  it('turns an error envelope of the export into an ApiError with its code', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: ['Слишком много записей'], code: 'too_many_rows' }), { status: 400 }),
    );

    await expect(downloadFinanceExport('2020-01-01', '2020-12-31')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'too_many_rows',
      message: 'Слишком много записей',
    });
  });
});
