import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ApiError, downloadFinanceExport, fetchCategories, silentRefresh } from './api';
import { getAccessToken, onAccessTokenChange, setAccessToken } from './authToken';

const AUTH = { userId: 1, email: 'a@example.com', name: 'A', role: 'Customer', accessToken: 'new-access' };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, errors: [], data }), { status: 200 });
const fail = (status: number) => new Response(JSON.stringify({ success: false, errors: ['x'], data: null }), { status });

describe('access-token refresh on the site', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  let cleared: ReturnType<typeof vi.fn<() => void>>;
  let unsubscribe: () => void;

  const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).length;
  const refreshCalls = () => calls('/auth/refresh');
  const categoryCalls = () => calls('/categories');

  /** /categories answers with the given statuses in turn (then the last one forever). */
  function categoriesAnswer(...statuses: number[]) {
    let n = 0;
    return () => {
      const status = statuses[Math.min(n++, statuses.length - 1)];
      return Promise.resolve(status === 200 ? ok([]) : fail(status));
    };
  }

  function route(handlers: { categories: () => Promise<Response>; refresh: () => Promise<Response> }) {
    fetchMock.mockImplementation((url) =>
      String(url).endsWith('/auth/refresh') ? handlers.refresh() : handlers.categories()
    );
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-access');
    cleared = vi.fn<() => void>();
    unsubscribe = onAccessTokenChange((token) => {
      if (!token) cleared();
    });
  });

  afterEach(() => {
    unsubscribe();
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  // ---- one shared refresh ----

  it('a page-load refresh and a 401-triggered refresh share ONE /auth/refresh request', async () => {
    let finishRefresh!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (finishRefresh = resolve));
    route({ categories: categoriesAnswer(401, 200), refresh: () => pending });

    const restoring = silentRefresh(); // AuthContext on page load
    const loading = fetchCategories(); // a request that meets an expired token meanwhile
    await vi.waitFor(() => expect(categoryCalls()).toBe(1)); // the 401 has been answered and is waiting for the refresh
    finishRefresh(ok(AUTH));

    expect(await restoring).toMatchObject({ accessToken: 'new-access' });
    await expect(loading).resolves.toEqual([]);
    expect(refreshCalls()).toBe(1);
    expect(categoryCalls()).toBe(2); // exactly one retry
    expect(getAccessToken()).toBe('new-access');
  });

  it('a double mount of the effect (StrictMode) sends one request and both callers get the session', async () => {
    route({ categories: categoriesAnswer(200), refresh: () => Promise.resolve(ok(AUTH)) });

    const [first, second] = await Promise.all([silentRefresh(), silentRefresh()]);

    expect(refreshCalls()).toBe(1);
    expect(first).toMatchObject({ userId: 1 });
    expect(second).toMatchObject({ userId: 1 });
  });

  it('after one refresh settles, the next one is a new request (the shared promise is released)', async () => {
    route({ categories: categoriesAnswer(200), refresh: () => Promise.resolve(ok(AUTH)) });

    await silentRefresh();
    await silentRefresh();

    expect(refreshCalls()).toBe(2);
  });

  it('the shared promise is released after a failure too', async () => {
    route({ categories: categoriesAnswer(200), refresh: () => Promise.reject(new TypeError('offline')) });

    await expect(silentRefresh()).rejects.toBeInstanceOf(ApiError);
    await expect(silentRefresh()).rejects.toBeInstanceOf(ApiError);

    expect(refreshCalls()).toBe(2);
  });

  // ---- rejected: the session is over ----

  it.each([401, 403])('refresh answering %i signs the user out', async (status) => {
    route({ categories: categoriesAnswer(401), refresh: () => Promise.resolve(fail(status)) });

    await expect(fetchCategories()).rejects.toMatchObject({ status: 401 });

    expect(getAccessToken()).toBeNull();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(refreshCalls()).toBe(1);
    expect(categoryCalls()).toBe(1); // no retry without a fresh token
  });

  it('silentRefresh answers null when the server rejects the cookie', async () => {
    route({ categories: categoriesAnswer(200), refresh: () => Promise.resolve(fail(401)) });

    expect(await silentRefresh()).toBeNull();
  });

  // ---- unavailable: the session is kept ----

  it('a network failure of the refresh keeps the token and reports the service as unreachable', async () => {
    route({ categories: categoriesAnswer(401), refresh: () => Promise.reject(new TypeError('offline')) });

    await expect(fetchCategories()).rejects.toMatchObject({ status: 0, message: i18n.t('errors.connect') });

    expect(getAccessToken()).toBe('old-access');
    expect(cleared).not.toHaveBeenCalled();
    expect(refreshCalls()).toBe(1);
    expect(categoryCalls()).toBe(1);
  });

  it.each([500, 502, 503, 429, 400])('refresh answering %i keeps the token', async (status) => {
    route({ categories: categoriesAnswer(401), refresh: () => Promise.resolve(fail(status)) });

    await expect(fetchCategories()).rejects.toMatchObject({ status: 0, message: i18n.t('errors.connect') });

    expect(getAccessToken()).toBe('old-access');
    expect(cleared).not.toHaveBeenCalled();
  });

  it('an unreadable 200 answer of the refresh keeps the token', async () => {
    route({ categories: categoriesAnswer(401), refresh: () => Promise.resolve(new Response('<html>', { status: 200 })) });

    await expect(fetchCategories()).rejects.toMatchObject({ status: 0 });

    expect(getAccessToken()).toBe('old-access');
    expect(cleared).not.toHaveBeenCalled();
  });

  it('silentRefresh throws (instead of answering "no session") on a network failure or 5xx, so the sign-in hint survives', async () => {
    route({ categories: categoriesAnswer(200), refresh: () => Promise.reject(new TypeError('offline')) });
    await expect(silentRefresh()).rejects.toBeInstanceOf(ApiError);

    route({ categories: categoriesAnswer(200), refresh: () => Promise.resolve(fail(503)) });
    await expect(silentRefresh()).rejects.toBeInstanceOf(ApiError);

    expect(cleared).not.toHaveBeenCalled();
  });

  it('the Excel download follows the same rules: unreachable refresh keeps the token, rejected refresh signs out', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(String(url).endsWith('/auth/refresh') ? fail(503) : fail(401))
    );
    await expect(downloadFinanceExport('2026-10-01', '2026-10-04')).rejects.toMatchObject({ status: 0 });
    expect(getAccessToken()).toBe('old-access');

    fetchMock.mockImplementation(() => Promise.resolve(fail(401))); // the export and the refresh are both refused
    await expect(downloadFinanceExport('2026-10-01', '2026-10-04')).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  // ---- no loop ----

  it('retries a request once: a second 401 after a successful refresh is an error, not another refresh', async () => {
    route({ categories: categoriesAnswer(401), refresh: () => Promise.resolve(ok(AUTH)) });

    await expect(fetchCategories()).rejects.toMatchObject({ status: 401 });

    expect(categoryCalls()).toBe(2);
    expect(refreshCalls()).toBe(1);
    expect(getAccessToken()).toBe('new-access'); // the session itself is fine
  });
});
