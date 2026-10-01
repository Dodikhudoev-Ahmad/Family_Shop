import * as Crypto from 'expo-crypto';
import { SECRET_KEYS, type SecretStore } from './storage/types';

/** Same shape the backend accepts: 16-128 URL-safe characters. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidDeviceId(value: string | null): value is string {
  return value !== null && DEVICE_ID_PATTERN.test(value);
}

/**
 * Returns this installation's device id, generating it exactly once (first launch) and keeping it in
 * the secure store. The server stores only its hash and refuses to refresh a token presented without
 * the matching id, so it must be stable. Concurrent first calls share one generation.
 */
export function createDeviceIdProvider(store: SecretStore, generate: () => string = Crypto.randomUUID) {
  let pending: Promise<string> | null = null;

  async function load(): Promise<string> {
    const existing = await store.get(SECRET_KEYS.deviceId);
    if (isValidDeviceId(existing)) return existing;

    const created = generate();
    await store.set(SECRET_KEYS.deviceId, created);
    return created;
  }

  return function getDeviceId(): Promise<string> {
    pending ??= load().catch((error: unknown) => {
      pending = null; // let the next call try again instead of caching a failure
      throw error;
    });
    return pending;
  };
}
