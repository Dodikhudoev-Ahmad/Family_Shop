import { Platform } from 'react-native';
import i18n from '../../i18n';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config';
import { createDeviceIdProvider } from '../deviceId';
import { secureStorage } from '../storage/secureStorage';
import { ApiError } from './errors';
import { createTokenStore, type TokenStore } from './tokenStore';
import type { ApiResponse, AuthUser, MobileAuthResponseDto, SessionDto } from './types';

/** Refresh slightly before the access token actually expires, so a request never goes out with a dying one. */
const REFRESH_SKEW_MS = 30_000;

type AuthMode = 'required' | 'none';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 'required' attaches the access token (refreshing it when needed); 'none' sends no credentials. */
  auth?: AuthMode;
  /** Extra request headers (e.g. Idempotency-Key); never Authorization / Content-Type, which the client owns. */
  headers?: Record<string, string>;
}

type RefreshOutcome =
  | { outcome: 'ok'; user: AuthUser }
  | { outcome: 'no-session' } // nothing stored to refresh with
  | { outcome: 'rejected' } // the server refused the token: the session is gone (tokens already cleared)
  | { outcome: 'unavailable' }; // network/server trouble: the session may be fine, so it is kept

export interface ApiClientDeps {
  baseUrl: string;
  tokens: TokenStore;
  getDeviceId: () => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** Shown in the user's "my devices" list. Display only. */
  deviceName?: string;
}

function toUser(data: MobileAuthResponseDto): AuthUser {
  return { id: data.userId, email: data.email, name: data.name, role: data.role };
}

/**
 * HTTP client for the Family Shop API with the mobile auth contract:
 *  - access token (15 min): memory only, attached as `Authorization: Bearer`;
 *  - refresh token: secure store only, sent in the BODY of /auth/mobile/refresh together with the deviceId;
 *  - ONE shared refresh at a time - the server rotates the refresh token on every use and treats a
 *    replayed one as theft (it revokes the whole session), so two parallel refreshes would destroy it;
 *  - nothing here ever logs a token, a password or a request body.
 */
export function createApiClient(deps: ApiClientDeps) {
  const { baseUrl, tokens, getDeviceId } = deps;
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deviceName = deps.deviceName ?? `${Platform.OS} ${String(Platform.Version)}`;

  let inflightRefresh: Promise<RefreshOutcome> | null = null;

  async function send(path: string, options: RequestOptions, accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      // The client owns these: a caller cannot swap the credentials or the body type.
      if (!['authorization', 'content-type', 'accept'].includes(name.toLowerCase())) headers[name] = value;
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      // Deliberately drops the original error: it may carry the URL/body details we must not surface.
      throw new ApiError(0, i18n.t('errors.connect'));
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseEnvelope<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    if (res.status === 429) throw new ApiError(429, i18n.t('errors.tooMany'));

    let json: ApiResponse<T>;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError(res.status, i18n.t('errors.server', { status: res.status }));
    }

    if (!json.success) {
      throw new ApiError(res.status, json.errors.join('; ') || i18n.t('errors.failed'), { code: json.code, meta: json.meta });
    }
    return json.data;
  }

  async function adoptSession(data: MobileAuthResponseDto, tolerateStorageFailure: boolean): Promise<void> {
    tokens.setAccessToken(data.accessToken, data.accessTokenExpiresInSeconds, now());
    try {
      await tokens.setRefreshToken(data.refreshToken, data.refreshTokenExpiresAt);
    } catch {
      // On rotation a failed write must not throw the session away (it is still held in memory);
      // at login there is nothing to fall back on, so surface it.
      if (!tolerateStorageFailure) throw new ApiError(0, i18n.t('errors.failed'));
    }
  }

  async function doRefresh(): Promise<RefreshOutcome> {
    const refreshToken = await tokens.getRefreshToken(now());
    if (!refreshToken) return { outcome: 'no-session' };

    const deviceId = await getDeviceId();
    let res: Response;
    try {
      res = await send('/auth/mobile/refresh', { method: 'POST', body: { refreshToken, deviceId } }, null);
    } catch {
      return { outcome: 'unavailable' };
    }

    if (res.ok) {
      try {
        const body = (await res.json()) as ApiResponse<MobileAuthResponseDto>;
        if (body.success) {
          await adoptSession(body.data, true);
          return { outcome: 'ok', user: toUser(body.data) };
        }
      } catch {
        // unreadable success body: treat like a transient failure, the old token was NOT consumed by us
      }
      return { outcome: 'unavailable' };
    }

    // 401: unknown/expired/replayed token or wrong device. 403: forbidden. The session is over.
    if (res.status === 401 || res.status === 403) {
      await tokens.clear();
      return { outcome: 'rejected' };
    }

    // 400 (a bug on our side), 429, 5xx: do not destroy a session over a hiccup.
    return { outcome: 'unavailable' };
  }

  /** One refresh at a time, shared by everyone who asks while it is in flight. */
  function refresh(): Promise<RefreshOutcome> {
    inflightRefresh ??= doRefresh().finally(() => {
      inflightRefresh = null;
    });
    return inflightRefresh;
  }

  async function currentAccessToken(): Promise<string> {
    const token = tokens.getAccessToken();
    if (token && tokens.accessTokenTimeLeftMs(now()) > REFRESH_SKEW_MS) return token;

    const result = await refresh();
    if (result.outcome === 'ok') {
      const fresh = tokens.getAccessToken();
      if (fresh) return fresh;
    }
    // Could not refresh. A token that is still technically valid may carry this one request.
    if (result.outcome === 'unavailable' && token && tokens.accessTokenTimeLeftMs(now()) > 0) return token;
    if (result.outcome === 'unavailable') throw new ApiError(0, i18n.t('errors.connect'));
    throw new ApiError(401, i18n.t('mobile.sessionEnded'));
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if ((options.auth ?? 'none') === 'none') {
      return parseEnvelope<T>(await send(path, options, null));
    }

    const usedToken = await currentAccessToken();
    let res = await send(path, options, usedToken);

    if (res.status === 401) {
      // If someone else already refreshed while this request was in flight, just retry with the new
      // token; otherwise refresh (shared) first.
      const latest = tokens.getAccessToken();
      if (latest !== null && latest !== usedToken) {
        res = await send(path, options, latest);
      } else {
        const result = await refresh();
        if (result.outcome === 'ok') {
          res = await send(path, options, tokens.getAccessToken());
        } else if (result.outcome === 'unavailable') {
          throw new ApiError(0, i18n.t('errors.connect'));
        } else {
          throw new ApiError(401, i18n.t('mobile.sessionEnded'));
        }
      }
    }

    return parseEnvelope<T>(res);
  }

  // ---- auth ----

  async function establishSession(path: string, body: Record<string, unknown>): Promise<AuthUser> {
    const deviceId = await getDeviceId();
    const data = await request<MobileAuthResponseDto>(path, {
      method: 'POST',
      body: { ...body, deviceId, deviceName },
    });
    await adoptSession(data, false);
    return toUser(data);
  }

  return {
    request,

    login: (email: string, password: string): Promise<AuthUser> =>
      establishSession('/auth/mobile/login', { email, password }),

    register: (email: string, password: string, name: string): Promise<AuthUser> =>
      establishSession('/auth/mobile/register', { email, password, name }),

    /** Restores the user at app start from the stored refresh token. Null when there is no live session. */
    async restoreSession(): Promise<AuthUser | null> {
      const result = await refresh();
      return result.outcome === 'ok' ? result.user : null;
    },

    /** Ends this device's session on the server and always forgets it locally, even when offline. */
    async logout(): Promise<void> {
      try {
        const refreshToken = await tokens.getRefreshToken(now());
        if (refreshToken) {
          const deviceId = await getDeviceId();
          await send('/auth/mobile/logout', { method: 'POST', body: { refreshToken, deviceId } }, null);
        }
      } catch {
        // offline: the server-side session simply expires on its own
      } finally {
        await tokens.clear();
      }
    },

    /** "Log out everywhere": revokes every session of the user (web and mobile), then forgets this one. */
    async logoutAll(): Promise<void> {
      try {
        await request<void>('/auth/logout-all', { method: 'POST', auth: 'required' });
      } finally {
        await tokens.clear();
      }
    },

    /**
     * Deletes the signed-in user's own account (App Store 5.1.1(v)). The current password is required; the server
     * answers 400 for a wrong one (the session stays), 403 for an administrator. On success every session is gone
     * server-side and this device forgets its tokens too.
     */
    async deleteAccount(password: string): Promise<void> {
      await request<void>('/auth/me', { method: 'DELETE', body: { password }, auth: 'required' });
      await tokens.clear();
    },

    fetchSessions: (): Promise<SessionDto[]> => request<SessionDto[]>('/auth/sessions', { auth: 'required' }),

    revokeSession: (sessionId: string): Promise<void> =>
      request<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', auth: 'required' }),

    onSignedOut: tokens.onSignedOut,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

const tokens = createTokenStore(secureStorage);

/** The app-wide client. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  tokens,
  getDeviceId: createDeviceIdProvider(secureStorage),
});
