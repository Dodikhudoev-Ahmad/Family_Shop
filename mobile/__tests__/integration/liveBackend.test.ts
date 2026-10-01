import { createApiClient } from '../../src/lib/api/client';
import { createTokenStore } from '../../src/lib/api/tokenStore';
import { createDeviceIdProvider } from '../../src/lib/deviceId';
import { SECRET_KEYS } from '../../src/lib/storage/types';
import { memorySecretStore } from '../../test-utils/auth';
import { nodeFetch } from '../../test-utils/nodeFetch';

/**
 * Opt-in contract test of the REAL mobile client against a REAL backend (not mocks).
 *   FS_LIVE_API=http://localhost:5288/api/v1 npx jest __tests__/integration
 * Use a throw-away local backend: it registers users and burns sessions on purpose.
 */
const BASE = process.env.FS_LIVE_API;
const describeLive = BASE ? describe : describe.skip;

const PASSWORD = 'Tr1cky-Horse-Battery';
const DEVICE_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const DEVICE_B = 'bbbbbbbb-1111-2222-3333-444444444444';

function makeClient(store = memorySecretStore(), deviceId = DEVICE_A, clock: { offset: number } = { offset: 0 }) {
  const tokens = createTokenStore(store);
  const refreshCalls: number[] = [];
  const countingFetch = ((url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/mobile/refresh')) refreshCalls.push(Date.now());
    return nodeFetch(url, init);
  }) as typeof fetch;
  const client = createApiClient({
    baseUrl: BASE ?? '',
    tokens,
    getDeviceId: createDeviceIdProvider(store, () => deviceId),
    fetchImpl: countingFetch,
    now: () => Date.now() + clock.offset,
    deviceName: 'Jest Phone',
  });
  return { store, tokens, client, refreshCalls, clock };
}

describeLive('mobile auth against the real backend', () => {
  jest.setTimeout(60_000);
  const email = `mobile-${Date.now()}@example.kz`;

  it('register -> authenticated call -> parallel refresh storm -> restart -> replay/device theft -> logout', async () => {
    const a = makeClient();

    // register: tokens come back in the body, the client keeps only the refresh token (secure store)
    const user = await a.client.register(email, PASSWORD, 'Jest User');
    expect(user.email).toBe(email);
    expect(a.store.data.get(SECRET_KEYS.refreshToken)).toBeTruthy();
    expect(a.store.data.get(SECRET_KEYS.deviceId)).toBe(DEVICE_A);

    // an authenticated endpoint accepts the Bearer access token and sees this device
    const sessions = await a.client.fetchSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ clientType: 'Mobile', deviceName: 'Jest Phone', isCurrent: true });

    // the access token "expires" (clock jumps past its 15 min) while 8 requests are in flight:
    // exactly ONE refresh may reach the server, and every request must still succeed
    a.clock.offset = 16 * 60 * 1000;
    const before = a.store.data.get(SECRET_KEYS.refreshToken);
    // (/orders, not /auth/sessions: the latter shares the strict 10/min login rate limit)
    const results = await Promise.all(Array.from({ length: 8 }, () => a.client.request<unknown[]>('/orders', { auth: 'required' })));
    expect(results.every((r) => Array.isArray(r))).toBe(true);
    expect(a.refreshCalls).toHaveLength(1);
    const rotated = a.store.data.get(SECRET_KEYS.refreshToken);
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(before);

    // "app restart": a brand-new client over the same secure store restores the session by itself
    const restarted = makeClient(a.store);
    expect(await restarted.client.restoreSession()).toMatchObject({ email });
    const afterRestart = a.store.data.get(SECRET_KEYS.refreshToken) as string;
    expect(afterRestart).not.toBe(rotated);

    // a token copied off the device, used from ANOTHER device, is refused and burns the session
    const thief = makeClient(memorySecretStore({ [SECRET_KEYS.refreshToken]: afterRestart, [SECRET_KEYS.deviceId]: DEVICE_B }), DEVICE_B);
    const stolen = await thief.client.restoreSession();
    expect(stolen).toBeNull();
    expect(thief.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);

    // ...so the real owner is signed out too (and told, so the UI can react)
    const signedOut = jest.fn();
    restarted.tokens.onSignedOut(signedOut);
    restarted.clock.offset = 16 * 60 * 1000;
    await expect(restarted.client.request('/orders', { auth: 'required' })).rejects.toMatchObject({ status: 401 });
    expect(signedOut).toHaveBeenCalled();
  });

  it('replaying an old (already rotated) refresh token after the grace window revokes the whole session', async () => {
    const a = makeClient();
    await a.client.login(email, PASSWORD);
    const stale = a.store.data.get(SECRET_KEYS.refreshToken) as string;

    a.clock.offset = 16 * 60 * 1000;
    await a.client.request('/orders', { auth: 'required' }); // rotates: `stale` is now an old token
    expect(a.store.data.get(SECRET_KEYS.refreshToken)).not.toBe(stale);

    await new Promise((resolve) => setTimeout(resolve, 11_000)); // leave the 10 s benign-race window

    const replay = makeClient(memorySecretStore({ [SECRET_KEYS.refreshToken]: stale, [SECRET_KEYS.deviceId]: DEVICE_A }));
    expect(await replay.client.restoreSession()).toBeNull();

    // the legitimate holder's current token died with the family
    const legit = makeClient(memorySecretStore({ [SECRET_KEYS.refreshToken]: a.store.data.get(SECRET_KEYS.refreshToken) as string, [SECRET_KEYS.deviceId]: DEVICE_A }));
    expect(await legit.client.restoreSession()).toBeNull();
  });

  it('logout ends the session on the server: the refresh token no longer works', async () => {
    const a = makeClient();
    await a.client.login(email, PASSWORD);
    const token = a.store.data.get(SECRET_KEYS.refreshToken) as string;

    await a.client.logout();
    expect(a.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);

    const again = makeClient(memorySecretStore({ [SECRET_KEYS.refreshToken]: token, [SECRET_KEYS.deviceId]: DEVICE_A }));
    expect(await again.client.restoreSession()).toBeNull();
  });

  it('a wrong password is a normal 401 and leaves no session behind', async () => {
    const a = makeClient();
    await expect(a.client.login(email, 'Wrong-Password-1')).rejects.toMatchObject({ status: 401 });
    expect(a.store.data.has(SECRET_KEYS.refreshToken)).toBe(false);
  });
});
