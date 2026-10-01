import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoutRequest, silentRefresh } from './api';

// The API refuses cookie-based calls (refresh, logout) that lack this header - a cross-site page
// cannot add it, so it is what stops a hostile site from using the SameSite=None cookie.
describe('cookie-based auth calls carry the CSRF marker header', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [], data: null }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentHeaders = () => new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);

  it('silent refresh sends X-Requested-With and the cookie', async () => {
    await silentRefresh();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/refresh$/);
    expect(sentHeaders().get('X-Requested-With')).toBe('fetch');
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include');
  });

  it('logout sends X-Requested-With', async () => {
    await logoutRequest();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/logout$/);
    expect(sentHeaders().get('X-Requested-With')).toBe('fetch');
  });
});
