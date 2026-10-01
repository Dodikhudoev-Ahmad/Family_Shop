import { createDeviceIdProvider, isValidDeviceId } from '../../src/lib/deviceId';
import { SECRET_KEYS } from '../../src/lib/storage/types';
import { memorySecretStore } from '../../test-utils/auth';

const GOOD = '11111111-2222-3333-4444-555555555555';

describe('device id', () => {
  it('is generated once on first launch, saved in the secure store and then reused', async () => {
    const store = memorySecretStore();
    let n = 0;
    const get = createDeviceIdProvider(store, () => `${GOOD.slice(0, -1)}${++n}`);

    const first = await get();
    expect(store.data.get(SECRET_KEYS.deviceId)).toBe(first);
    expect(await get()).toBe(first);

    // a "new app start": a fresh provider over the same store must read the saved id, not generate another
    const afterRestart = createDeviceIdProvider(store, () => 'should-not-be-used-0000000000');
    expect(await afterRestart()).toBe(first);
    expect(n).toBe(1);
  });

  it('concurrent first calls share one generated id', async () => {
    const store = memorySecretStore();
    let n = 0;
    const get = createDeviceIdProvider(store, () => `${GOOD.slice(0, -1)}${++n}`);

    const ids = await Promise.all([get(), get(), get(), get()]);

    expect(new Set(ids).size).toBe(1);
    expect(n).toBe(1);
  });

  it('replaces a corrupted stored value with a valid one', async () => {
    const store = memorySecretStore({ [SECRET_KEYS.deviceId]: 'bad value!' });
    const get = createDeviceIdProvider(store, () => GOOD);

    expect(await get()).toBe(GOOD);
    expect(store.data.get(SECRET_KEYS.deviceId)).toBe(GOOD);
  });

  it('a failing store does not cache the failure', async () => {
    const store = memorySecretStore();
    let fail = true;
    const realGet = store.get;
    store.get = (key) => (fail ? Promise.reject(new Error('keystore locked')) : realGet(key));
    const get = createDeviceIdProvider(store, () => GOOD);

    await expect(get()).rejects.toThrow();
    fail = false;
    expect(await get()).toBe(GOOD);
  });

  it('generated ids match what the backend accepts (16-128 URL-safe characters)', () => {
    expect(isValidDeviceId(GOOD)).toBe(true);
    expect(isValidDeviceId('short')).toBe(false);
    expect(isValidDeviceId('has spaces in it, definitely!')).toBe(false);
    expect(isValidDeviceId(null)).toBe(false);
    expect(isValidDeviceId('a'.repeat(129))).toBe(false);
  });
});
