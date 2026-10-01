import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { DEFAULT_THEME, palettes, type ColorTokens, type ThemeName } from './tokens';

export const THEME_STORAGE_KEY = 'fs.theme';

interface ThemeContextValue {
  theme: ThemeName;
  colors: ColorTokens;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (active && isThemeName(stored)) setThemeState(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setRestored(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, colors: palettes[theme], setTheme }), [theme, setTheme]);

  // Hold the first frame until the saved choice is known, so a dark-theme user doesn't see a white flash.
  if (!restored) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Builds a StyleSheet from the current colours; recomputed only when the theme changes. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ColorTokens) => T): T {
  const { colors } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the factory is a stable module-level function
  return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
}
