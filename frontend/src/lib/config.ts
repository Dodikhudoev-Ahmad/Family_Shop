/** Where the API lives for local development when no environment variable says otherwise. */
export const DEV_API_BASE_URL = 'http://localhost:5280/api/v1';

/**
 * The API base URL, from the build environment only (no host is written in the code):
 *  - `VITE_API_URL` (e.g. https://api.familyshop10.kz/api/v1) - the name to use from now on;
 *  - `VITE_API_BASE_URL` - the earlier name, still honoured, so a deployment that has only that variable keeps working;
 *  - otherwise the local development API.
 * A trailing slash is dropped (paths are appended with a leading one).
 */
export function resolveApiBaseUrl(env: Record<string, unknown>): string {
  const text = (name: string) => (typeof env[name] === 'string' ? (env[name] as string).trim() : '');
  return (text('VITE_API_URL') || text('VITE_API_BASE_URL') || DEV_API_BASE_URL).replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env);
