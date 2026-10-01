/**
 * Design tokens - the React Native counterpart of frontend/src/styles/tokens.css.
 * Same palette (terracotta accent #C17A54), same spacing/radius scale.
 */
export const lightColors = {
  bg: '#FFFFFF',
  bgSecondary: '#F7F5F3',
  text: '#1A1A1A',
  textSecondary: '#5A5754',
  accent: '#C17A54',
  accentHover: '#A8663F',
  accentSoft: 'rgba(193, 122, 84, 0.15)',
  border: '#E5E2DE',
  error: '#C1544B',
  success: '#5A8A6B',
  warning: '#B5811F',
  white: '#FFFFFF',
  overlay: 'rgba(26, 26, 26, 0.35)',
};

/** Same keys as the light palette - the type below makes a missing dark colour a compile error. */
export type ColorTokens = Record<keyof typeof lightColors, string>;

export const darkColors: ColorTokens = {
  bg: '#16151A',
  bgSecondary: '#201F26',
  text: '#F0EEEC',
  textSecondary: '#9C9994',
  accent: '#D08F68',
  accentHover: '#E0A17C',
  accentSoft: 'rgba(208, 143, 104, 0.24)',
  border: '#322F36',
  error: '#D97468',
  success: '#7BAE8C',
  warning: '#D9A24B',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export type ThemeName = 'light' | 'dark';

/** Light is the default; the OS appearance setting is deliberately not consulted. */
export const DEFAULT_THEME: ThemeName = 'light';

export const palettes: Record<ThemeName, ColorTokens> = { light: lightColors, dark: darkColors };

/** Mirrors --space-1..8 (4, 8, 16, 24, 32, 48, 64, 96). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, huge: 96 } as const;

export const radius = { sm: 6, md: 12, lg: 16, pill: 999 } as const;

/** Loaded in App.tsx via @expo-google-fonts; falls back to the system fonts if loading fails. */
export const fonts = {
  heading: 'Fraunces_600SemiBold',
  headingBold: 'Fraunces_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

export const fontSizes = { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28, display: 34 } as const;

/** Minimum comfortable touch target (matches the web app's rule). */
export const MIN_TOUCH_TARGET = 44;
