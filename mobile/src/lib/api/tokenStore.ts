import { SECRET_KEYS, type SecretStore } from '../storage/types';

export interface TokenStore {
  getAccessToken(): string | null;
  /** Milliseconds until the in-memory access token expires (<= 0 when absent or already expired). */
  accessTokenTimeLeftMs(now: number): number;
  setAccessToken(token: string, expiresInSeconds: number, now: number): void;
  getRefreshToken(now: number): Promise<string | null>;
  setRefreshToken(token: string, expiresAtIso: string): Promise<void>;
  /** Forgets the whole session (memory + secure store) and tells subscribers the user is signed out. */
  clear(): Promise<void>;
  onSignedOut(listener: () => void): () => void;
}

/**
 * Where the session's secrets live:
 *  - access token: memory only, never written anywhere (15 minutes, cheap to re-obtain);
 *  - refresh token (+ its expiry): the secure store only.
 */
export function createTokenStore(store: SecretStore): TokenStore {
  let access: string | null = null;
  let accessExpiresAtMs = 0;
  let refreshCache: { token: string; expiresAtMs: number } | null = null;
  const listeners = new Set<() => void>();

  const parseTime = (iso: string): number => {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 0 : ms;
  };

  return {
    getAccessToken: () => access,

    accessTokenTimeLeftMs: (now) => (access === null ? 0 : accessExpiresAtMs - now),

    setAccessToken(token, expiresInSeconds, now) {
      access = token;
      accessExpiresAtMs = now + expiresInSeconds * 1000;
    },

    async getRefreshToken(now) {
      if (!refreshCache) {
        const [token, expiresAt] = await Promise.all([
          store.get(SECRET_KEYS.refreshToken),
          store.get(SECRET_KEYS.refreshExpiresAt),
        ]);
        if (!token) return null;
        refreshCache = { token, expiresAtMs: expiresAt ? parseTime(expiresAt) : 0 };
      }

      // An expired refresh token can only be rejected by the server - don't bother asking.
      if (refreshCache.expiresAtMs !== 0 && now >= refreshCache.expiresAtMs) return null;
      return refreshCache.token;
    },

    async setRefreshToken(token, expiresAtIso) {
      // Remember it in memory first: if the write below fails, the session still works until the app
      // restarts, instead of being lost mid-rotation.
      refreshCache = { token, expiresAtMs: parseTime(expiresAtIso) };
      await store.set(SECRET_KEYS.refreshToken, token);
      await store.set(SECRET_KEYS.refreshExpiresAt, expiresAtIso);
    },

    async clear() {
      access = null;
      accessExpiresAtMs = 0;
      refreshCache = null;
      await Promise.allSettled([store.remove(SECRET_KEYS.refreshToken), store.remove(SECRET_KEYS.refreshExpiresAt)]);
      listeners.forEach((listener) => listener());
    },

    onSignedOut(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
