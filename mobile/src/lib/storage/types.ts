/** The minimal async key-value contract the auth layer needs - implemented by SecureStore on device. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Keys (SecureStore allows only letters, digits, '.', '-' and '_'). */
export const SECRET_KEYS = {
  refreshToken: 'fs.refreshToken',
  refreshExpiresAt: 'fs.refreshExpiresAt',
  deviceId: 'fs.deviceId',
} as const;
