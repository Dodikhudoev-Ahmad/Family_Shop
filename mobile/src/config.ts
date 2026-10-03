/** Production API. Override for local work with EXPO_PUBLIC_API_URL (e.g. http://192.168.1.5:5280/api/v1). */
export const DEFAULT_API_BASE_URL = 'https://api.familyshop10.kz/api/v1';

/**
 * Tokens travel in request/response bodies and the Authorization header, so a release build must never
 * talk to the API over plain http. Development builds may (a local backend has no certificate).
 */
export function resolveApiBaseUrl(raw: string | undefined, isDev: boolean): string {
  const value = (raw?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  if (!isDev && !/^https:\/\//i.test(value)) {
    throw new Error('EXPO_PUBLIC_API_URL must be an https:// URL in a release build.');
  }
  return value;
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);

/** Requests that take longer than this are aborted (a hung request must not hang the screen). */
export const REQUEST_TIMEOUT_MS = 20_000;
