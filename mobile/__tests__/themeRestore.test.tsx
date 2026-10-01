import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY, ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function Probe() {
  return <Text>{useTheme().theme}</Text>;
}

async function render(): Promise<string> {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
  });
  return JSON.stringify(tree.toJSON());
}

describe('theme restore', () => {
  beforeEach(() => AsyncStorage.clear());

  it('opens light when nothing is saved', async () => {
    expect(await render()).toContain('light');
  });

  it('ignores a stale pre-v2 "dark" and removes it', async () => {
    await AsyncStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'dark');
    expect(await render()).toContain('light');
    expect(await AsyncStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it('still restores a choice made in this version', async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(await render()).toContain('dark');
  });
});

describe('device settings are never consulted', () => {
  it('src does not read the OS colour scheme or locale', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execSync(`grep -rlE "useColorScheme|Appearance\\.|expo-localization|getLocales" src || true`, { encoding: 'utf8' });
    expect(hits.trim()).toBe('');
  });
});
