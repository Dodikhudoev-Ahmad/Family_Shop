import type { SecretStore } from '../src/lib/storage/types';
import type { MobileAuthResponseDto } from '../src/lib/api/types';

export interface MemorySecretStore extends SecretStore {
  data: Map<string, string>;
}

export function memorySecretStore(initial: Record<string, string> = {}): MemorySecretStore {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

/** A minimal Response stand-in: status + JSON body. */
export function jsonResponse(status: number, body?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  } as unknown as Response;
}

export function envelope<T>(data: T) {
  return { success: true, data, errors: [] as string[] };
}

export function failure(...errors: string[]) {
  return { success: false, data: null, errors };
}

export function authDto(n: number, over: Partial<MobileAuthResponseDto> = {}): MobileAuthResponseDto {
  return {
    userId: 1,
    email: 'alice@example.kz',
    name: 'Alice',
    role: 'Customer',
    accessToken: `access-${n}`,
    accessTokenExpiresInSeconds: 900,
    refreshToken: `refresh-${n}`,
    refreshTokenExpiresAt: new Date(Date.UTC(2030, 0, 1)).toISOString(),
    ...over,
  };
}
