import { createApiClient } from '../src/lib/api/client';
import { createTokenStore } from '../src/lib/api/tokenStore';
import { createDeviceIdProvider } from '../src/lib/deviceId';
import { createIdempotencyKeyHolder, newIdempotencyKey } from '../src/lib/idempotency';
import { envelope, jsonResponse, memorySecretStore } from '../test-utils/auth';

describe('newIdempotencyKey', () => {
  it('is a UUID the server accepts (8-100 URL-safe characters), different every time', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9._:-]{8,100}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe('createIdempotencyKeyHolder', () => {
  const counter = () => {
    let n = 0;
    return () => `key-${++n}-padding`;
  };

  it('opens with a key and keeps it for the same request (double tap, retry after a lost answer or a refusal)', () => {
    const holder = createIdempotencyKeyHolder(counter());
    const first = holder.keyFor('body-A');
    expect(first).toBe('key-1-padding'); // the one made when checkout opened
    expect(holder.keyFor('body-A')).toBe(first);
  });

  it('takes a new key when the body changes - the server refuses a key reused with another body', () => {
    const holder = createIdempotencyKeyHolder(counter());
    const a = holder.keyFor('body-A');
    const b = holder.keyFor('body-B');
    expect(b).not.toBe(a);
    expect(holder.keyFor('body-B')).toBe(b);
    expect(holder.keyFor('body-A')).not.toBe(b);
  });

  it('takes a new key after the order was placed', () => {
    const holder = createIdempotencyKeyHolder(counter());
    const first = holder.keyFor('body-A');
    holder.reset();
    expect(holder.keyFor('body-A')).not.toBe(first);
  });
});

describe('the API client and extra headers', () => {
  const setup = () => {
    const store = memorySecretStore();
    const calls: { headers: Record<string, string> }[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      tokens: createTokenStore(store),
      getDeviceId: createDeviceIdProvider(store, () => '11111111-2222-3333-4444-555555555555'),
      fetchImpl: ((_: string, init: RequestInit) => {
        calls.push({ headers: init.headers as Record<string, string> });
        return Promise.resolve(jsonResponse(200, envelope({ id: 5 })));
      }) as unknown as typeof fetch,
      now: () => 0,
      deviceName: 'Test',
    });
    return { client, calls };
  };

  it('sends the Idempotency-Key header it was given', async () => {
    const { client, calls } = setup();
    await client.request('/orders', { method: 'POST', body: {}, headers: { 'Idempotency-Key': 'abcd1234-key' } });
    expect(calls[0].headers['Idempotency-Key']).toBe('abcd1234-key');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
  });

  it('never lets extra headers replace Content-Type or Authorization', async () => {
    const { client, calls } = setup();
    await client.request('/orders', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer stolen' } });
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});
