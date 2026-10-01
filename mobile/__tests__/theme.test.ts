import { darkColors, DEFAULT_THEME, lightColors, palettes, spacing } from '../src/theme/tokens';

describe('design tokens', () => {
  it('default theme is light', () => {
    expect(DEFAULT_THEME).toBe('light');
  });

  it('keeps the brand terracotta and the dark palette of the website', () => {
    expect(lightColors.accent).toBe('#C17A54');
    expect(lightColors.bg).toBe('#FFFFFF');
    expect(darkColors.bg).toBe('#16151A');
    expect(darkColors.accent).toBe('#D08F68');
  });

  it('light and dark define exactly the same colour keys', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    expect(Object.keys(palettes)).toEqual(['light', 'dark']);
  });

  it('every colour is a real colour value', () => {
    for (const value of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(value).toMatch(/^(#[0-9A-Fa-f]{6}|rgba\([\d\s.,]+\))$/);
    }
  });

  it('uses the website spacing scale', () => {
    expect([spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl, spacing.xxl, spacing.xxxl, spacing.huge]).toEqual([4, 8, 16, 24, 32, 48, 64, 96]);
  });
});
