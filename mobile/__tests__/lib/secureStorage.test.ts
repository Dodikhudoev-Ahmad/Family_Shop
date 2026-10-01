import * as SecureStore from 'expo-secure-store';
import { secureStorage } from '../../src/lib/storage/secureStorage';

describe('secureStorage (device Keychain/Keystore)', () => {
  it('stores secrets as this-device-only entries (kept out of backups and device migration)', async () => {
    await secureStorage.set('fs.refreshToken', 'abc');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('fs.refreshToken', 'abc', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(await secureStorage.get('fs.refreshToken')).toBe('abc');
    await secureStorage.remove('fs.refreshToken');
    expect(await secureStorage.get('fs.refreshToken')).toBeNull();
  });
});
