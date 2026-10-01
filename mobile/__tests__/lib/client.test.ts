import { createApiClient } from '../../src/lib/api/client';
import { createTokenStore } from '../../src/lib/api/tokenStore';
import { createDeviceIdProvider } from '../../src/lib/deviceId';
import { SECRET_KEYS } from '../../src/lib/storage/types';
import { authDto, envelope, failure, jsonResponse, memorySecretStore } from '../../test-utils/auth';

const DEVICE = '11111111-2222-3333-4444-555555555555';
const BASE = 'https://api.test/api/v1';

type FetchCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

function setup(initialSecrets: Record<string, string> = {}) {
  const store = memorySecretStore(initialSecrets);
  const tokens = createTokenStore(store);
  let clock = Date.UTC(2026, 0, 1, 12, 0, 0);
  const calls: FetchCall[] = [];
  let handler: (call: FetchCall) => Response | Promise<Response> = () => jsonResponse(500);

  const fetchImpl = ((url: string, init: RequestInit) => {
    const call: FetchCall = {
      url: url.replace(BASE, ''),
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(call);
    return Promise.resolve(handler(call));
  }) as unknown as typeof fetch;

  const client = createApiClient({
    baseUrl: BASE,
    tokens,
    getDeviceId: createDeviceIdProvider(store, () => DEVICE),
    fetchImpl,
    now: () => clock,
    deviceName: 'Test Phone',
  });

  return {
    store,
    tokens,
    client,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    onFetch: (fn: (call: FetchCall) => Response | Promise<Response>) => {
      handler = fn;
    },
    refreshCalls: () => calls.filter((c) => c.url === '/auth/mobile/refresh'),
  };
}

async function loggedIn() {
  const h = setup();
  h.onFetch(() => jsonResponse(200, envelope(authDto(1))));
  await h.client.login('alice@example.kz', 'pw');
  h.calls.length = 0;
  return h;
}

describe('login', () => {
  it('sends the deviceId and device name, no client-type header, and stores the refresh token in the secure store only', async () => {
    const h = setup();
    h.onFetch(() => jsonResponse(200, envelope(authDto(1))));

    const user = await h.client.login('alice@example.kz', 'secret-pw');

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe('/auth/mobile/login');
    expect(h.calls[0].body).toEqual({ email: 'alice@example.kz', password: 'secret-pw', deviceId: DEVICE, deviceName: 'Test Phone' });
    expect(Object.keys(h.calls[0].headers).map((k) => k.toLowerCase())).not.toContain('x-client-type');
    expect(h.calls[0].headers.Authorization).toBeUndefined();
    expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-1');
    expect(h.store.data.get(SECRET_KEYS.deviceId)).toBe(DEVICE);
    expect(h.tokens.getAccessToken()).toBe('access-1');
    // The access token lives in memory only: it is not among the persisted secrets.
    expect([...h.store.data.values()]).not.toContain('access-1');
    // The caller gets the user, never a token.
    expect(user).toEqual({ id: 1, email: 'alice@example.kz', name: 'Alice', role: 'Customer' });
    expect(JSON.stringify(user)).not.toMatch(/access-|refresh-/);
  });

  it('a wrong password is a plain 401 error - it does NOT trigger a refresh attempt', async () => {
    const h = setup({ [SECRET_KEYS.refreshToken]: 'old-refresh' });
    h.onFetch(() => jsonResponse(401, failure('Invalid email or password.')));

    await expect(h.client.login('alice@example.kz', 'wrong')).rejects.toMatchObject({ status: 401, message: 'Invalid email or password.' });
    expect(h.refreshCalls()).toHaveLength(0);
  });

  it('registers through the mobile endpoint with the device id', async () => {
    const h = setup();
    h.onFetch(() => jsonResponse(200, envelope(authDto(1))));

    await h.client.register('new@example.kz', 'Tr1cky-Horse', 'New');

    expect(h.calls[0].url).toBe('/auth/mobile/register');
    expect(h.calls[0].body).toMatchObject({ email: 'new@example.kz', name: 'New', deviceId: DEVICE });
  });
});

describe('authenticated requests', () => {
  it('attach the Bearer access token', async () => {
    const h = await loggedIn();
    h.onFetch(() => jsonResponse(200, envelope([])));

    await h.client.request('/orders', { auth: 'required' });

    expect(h.calls[0].headers.Authorization).toBe('Bearer access-1');
  });

  it('public requests carry no credentials at all', async () => {
    const h = await loggedIn();
    h.onFetch(() => jsonResponse(200, envelope([])));

    await h.client.request('/categories');

    expect(h.calls[0].headers.Authorization).toBeUndefined();
  });

  it('refresh proactively when the access token is about to expire, using the stored refresh token and deviceId', async () => {
    const h = await loggedIn();
    h.advance(900_000 - 10_000); // 10s left < the 30s skew
    h.onFetch((call) =>
      call.url === '/auth/mobile/refresh' ? jsonResponse(200, envelope(authDto(2))) : jsonResponse(200, envelope('ok'))
    );

    await h.client.request('/orders', { auth: 'required' });

    expect(h.refreshCalls()).toHaveLength(1);
    expect(h.refreshCalls()[0].body).toEqual({ refreshToken: 'refresh-1', deviceId: DEVICE });
    const orders = h.calls.find((c) => c.url === '/orders');
    expect(orders?.headers.Authorization).toBe('Bearer access-2'); // the request used the NEW token
  });

  it('does not refresh while the token still has plenty of life', async () => {
    const h = await loggedIn();
    h.advance(60_000);
    h.onFetch(() => jsonResponse(200, envelope('ok')));

    await h.client.request('/orders', { auth: 'required' });

    expect(h.refreshCalls()).toHaveLength(0);
  });

  it('on a 401 refreshes once and retries the request with the new token', async () => {
    const h = await loggedIn();
    h.onFetch((call) => {
      if (call.url === '/auth/mobile/refresh') return jsonResponse(200, envelope(authDto(2)));
      return call.headers.Authorization === 'Bearer access-2' ? jsonResponse(200, envelope('fine')) : jsonResponse(401, failure('x'));
    });

    await expect(h.client.request<string>('/orders', { auth: 'required' })).resolves.toBe('fine');
    expect(h.refreshCalls()).toHaveLength(1);
    expect(h.calls.filter((c) => c.url === '/orders')).toHaveLength(2);
  });

  it('many parallel requests with an expired token cause exactly ONE refresh (rotation must not burn the session)', async () => {
    const h = await loggedIn();
    h.advance(900_000); // access token expired
    let releaseRefresh: () => void = () => undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    h.onFetch(async (call) => {
      if (call.url === '/auth/mobile/refresh') {
        await refreshGate; // hold the refresh open so every request piles up behind it
        return jsonResponse(200, envelope(authDto(2)));
      }
      return jsonResponse(200, envelope(call.headers.Authorization));
    });

    const pending = Array.from({ length: 8 }, () => h.client.request<string>('/orders', { auth: 'required' }));
    await Promise.resolve();
    releaseRefresh();
    const results = await Promise.all(pending);

    expect(h.refreshCalls()).toHaveLength(1);
    expect(results.every((r) => r === 'Bearer access-2')).toBe(true);
  });

  it('parallel requests that all get a 401 still share a single refresh, and none re-refreshes afterwards', async () => {
    const h = await loggedIn();
    h.onFetch(async (call) => {
      if (call.url === '/auth/mobile/refresh') {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse(200, envelope(authDto(2)));
      }
      return call.headers.Authorization === 'Bearer access-2' ? jsonResponse(200, envelope('ok')) : jsonResponse(401, failure('expired'));
    });

    await Promise.all(Array.from({ length: 6 }, () => h.client.request('/orders', { auth: 'required' })));

    expect(h.refreshCalls()).toHaveLength(1);
  });

  it('the rotated refresh token is persisted and is the one used next time', async () => {
    const h = await loggedIn();
    h.advance(900_000);
    h.onFetch((call) => {
      if (call.url !== '/auth/mobile/refresh') return jsonResponse(200, envelope('ok'));
      const used = (call.body as { refreshToken: string }).refreshToken;
      return jsonResponse(200, envelope(authDto(used === 'refresh-1' ? 2 : 3)));
    });

    await h.client.request('/orders', { auth: 'required' });
    expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-2');

    h.advance(900_000);
    await h.client.request('/orders', { auth: 'required' });

    expect(h.refreshCalls().map((c) => (c.body as { refreshToken: string }).refreshToken)).toEqual(['refresh-1', 'refresh-2']);
    expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-3');
  });

  it('keeps working after rotation even if writing the new refresh token to secure storage fails', async () => {
    const h = await loggedIn();
    h.advance(900_000);
    const realSet = h.store.set;
    h.store.set = () => Promise.reject(new Error('keystore busy'));
    h.onFetch((call) =>
      call.url === '/auth/mobile/refresh' ? jsonResponse(200, envelope(authDto(2))) : jsonResponse(200, envelope('ok'))
    );

    await expect(h.client.request('/orders', { auth: 'required' })).resolves.toBe('ok');

    h.store.set = realSet;
    h.advance(900_000);
    await h.client.request('/orders', { auth: 'required' });
    // the in-memory copy of the rotated token was used, not the stale persisted one
    expect((h.refreshCalls()[1].body as { refreshToken: string }).refreshToken).toBe('refresh-2');
  });
});

describe('when the server rejects or cannot be reached', () => {
  it('a rejected refresh (401) ends the session: tokens wiped, subscribers told, request fails with 401', async () => {
    const h = await loggedIn();
    const signedOut = jest.fn();
    h.tokens.onSignedOut(signedOut);
    h.advance(900_000);
    h.onFetch(() => jsonResponse(401, failure('Invalid or expired refresh token.')));

    await expect(h.client.request('/orders', { auth: 'required' })).rejects.toMatchObject({ status: 401 });

    expect(h.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);
    expect(h.tokens.getAccessToken()).toBeNull();
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(h.store.data.get(SECRET_KEYS.deviceId)).toBe(DEVICE); // the device id outlives sessions
  });

  it('a refresh that fails for network reasons does NOT sign the user out', async () => {
    const h = await loggedIn();
    h.advance(900_000);
    h.onFetch(() => Promise.reject(new Error('offline')));

    await expect(h.client.request('/orders', { auth: 'required' })).rejects.toMatchObject({ status: 0 });

    expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-1'); // still there for next time
  });

  it('a 5xx or 429 on refresh does not destroy the session either', async () => {
    for (const status of [429, 500, 503]) {
      const h = await loggedIn();
      h.advance(900_000);
      h.onFetch(() => jsonResponse(status, failure('busy')));

      await expect(h.client.request('/orders', { auth: 'required' })).rejects.toBeDefined();
      expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-1');
    }
  });

  it('with no session at all, an authenticated request fails with 401 without calling the network', async () => {
    const h = setup();
    h.onFetch(() => jsonResponse(200, envelope('x')));

    await expect(h.client.request('/orders', { auth: 'required' })).rejects.toMatchObject({ status: 401 });
    expect(h.calls).toHaveLength(0);
  });

  it('an expired stored refresh token is not even sent', async () => {
    const h = setup({
      [SECRET_KEYS.refreshToken]: 'stale',
      [SECRET_KEYS.refreshExpiresAt]: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    });
    h.onFetch(() => jsonResponse(200, envelope('x')));

    expect(await h.client.restoreSession()).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it('error messages never contain tokens or the password', async () => {
    const h = await loggedIn();
    h.onFetch(() => Promise.reject(new Error('socket hang up: Bearer access-1 refresh-1 secret-pw')));

    const error = await h.client.login('alice@example.kz', 'secret-pw').then(
      () => new Error('login should have failed'),
      (e: unknown) => e as Error
    );

    expect(String(error.message)).not.toMatch(/access-1|refresh-1|secret-pw/);
  });
});

describe('restoreSession', () => {
  it('returns null and makes no request when nothing is stored', async () => {
    const h = setup();
    expect(await h.client.restoreSession()).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it('restores the user from the stored refresh token (rotating it) at app start', async () => {
    const h = setup({ [SECRET_KEYS.refreshToken]: 'refresh-1', [SECRET_KEYS.deviceId]: DEVICE });
    h.onFetch(() => jsonResponse(200, envelope(authDto(2, { name: 'Alice' }))));

    expect(await h.client.restoreSession()).toMatchObject({ name: 'Alice' });
    expect(h.store.data.get(SECRET_KEYS.refreshToken)).toBe('refresh-2');
    expect(h.tokens.getAccessToken()).toBe('access-2');
  });

  it('concurrent restore calls share one refresh', async () => {
    const h = setup({ [SECRET_KEYS.refreshToken]: 'refresh-1', [SECRET_KEYS.deviceId]: DEVICE });
    h.onFetch(() => jsonResponse(200, envelope(authDto(2))));

    await Promise.all([h.client.restoreSession(), h.client.restoreSession(), h.client.restoreSession()]);

    expect(h.refreshCalls()).toHaveLength(1);
  });
});

describe('logout', () => {
  it('tells the server (token + deviceId in the body) and wipes everything locally', async () => {
    const h = await loggedIn();
    const signedOut = jest.fn();
    h.tokens.onSignedOut(signedOut);
    h.onFetch(() => jsonResponse(204));

    await h.client.logout();

    expect(h.calls[0].url).toBe('/auth/mobile/logout');
    expect(h.calls[0].body).toEqual({ refreshToken: 'refresh-1', deviceId: DEVICE });
    expect(h.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);
    expect(h.tokens.getAccessToken()).toBeNull();
    expect(signedOut).toHaveBeenCalled();
  });

  it('still signs out locally when the network is down', async () => {
    const h = await loggedIn();
    h.onFetch(() => Promise.reject(new Error('offline')));

    await expect(h.client.logout()).resolves.toBeUndefined();

    expect(h.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);
    expect(h.tokens.getAccessToken()).toBeNull();
  });

  it('logout-all calls the authenticated endpoint, then forgets the local session', async () => {
    const h = await loggedIn();
    h.onFetch(() => jsonResponse(204));

    await h.client.logoutAll();

    expect(h.calls[0]).toMatchObject({ url: '/auth/logout-all', method: 'POST' });
    expect(h.calls[0].headers.Authorization).toBe('Bearer access-1');
    expect(h.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);
  });
});

describe('response handling', () => {
  it('maps 429 to a friendly message and a non-JSON failure to a server error', async () => {
    const h = setup();
    h.onFetch(() => jsonResponse(429));
    await expect(h.client.request('/categories')).rejects.toMatchObject({ status: 429 });

    h.onFetch(() => jsonResponse(502));
    await expect(h.client.request('/categories')).rejects.toMatchObject({ status: 502 });
  });

  it('returns the unwrapped data of a successful envelope', async () => {
    const h = setup();
    h.onFetch(() => jsonResponse(200, envelope([{ id: 1 }])));
    await expect(h.client.request('/categories')).resolves.toEqual([{ id: 1 }]);
  });
});
