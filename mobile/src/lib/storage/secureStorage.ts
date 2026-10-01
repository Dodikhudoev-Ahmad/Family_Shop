import * as SecureStore from 'expo-secure-store';
import type { SecretStore } from './types';

// iOS Keychain / Android Keystore. THIS_DEVICE_ONLY keeps the entries out of backups and device
// migrations, which matters because the refresh token is bound to this very device: a restored copy
// on another phone would just be rejected (and burn the session) anyway.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** The ONLY place tokens and the device id are persisted - deliberately not AsyncStorage. */
export const secureStorage: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};
