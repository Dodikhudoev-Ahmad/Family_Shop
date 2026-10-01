import type { SecretStore } from './types';

// Web is NOT a shipped target - it exists only so the app can be previewed in a browser during
// development. expo-secure-store has no web implementation, and persisting tokens in localStorage
// would defeat the point, so on web secrets live in memory only and vanish on reload.
const memory = new Map<string, string>();

export const secureStorage: SecretStore = {
  get: (key) => Promise.resolve(memory.get(key) ?? null),
  set: (key, value) => {
    memory.set(key, value);
    return Promise.resolve();
  },
  remove: (key) => {
    memory.delete(key);
    return Promise.resolve();
  },
};
