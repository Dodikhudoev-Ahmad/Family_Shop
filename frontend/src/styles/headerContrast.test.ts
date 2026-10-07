import { describe, expect, it } from 'vitest';
import { contrast, hexOf, resolveTokens, type Theme, type Variant } from './tokenValues';

const COMBOS: [Variant, Theme][] = [
  ['a', 'light'],
  ['a', 'dark'],
  ['b', 'light'],
  ['b', 'dark'],
];

describe.each(COMBOS)('contrast, variant %s, %s theme', (variant, theme) => {
  const tokens = resolveTokens(variant, theme);
  const hex = (name: string) => hexOf(tokens, name);
  const ends = ['--header-from', '--header-to'] as const;

  it.each(ends)('header text (--header-fg) on %s is at least 4.5:1', (end) => {
    expect(contrast(hex('--header-fg'), hex(end))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ends)('muted header text (--header-fg-muted) on %s is at least 4.5:1', (end) => {
    expect(contrast(hex('--header-fg-muted'), hex(end))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ends)('logo accent letters (--header-accent) on %s are at least 4.5:1', (end) => {
    expect(contrast(hex('--header-accent'), hex(end))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ends)('active-tab indicator (--header-tab-indicator) on %s is at least 3:1', (end) => {
    expect(contrast(hex('--header-tab-indicator'), hex(end))).toBeGreaterThanOrEqual(3);
  });

  it('search field text is at least 4.5:1 on the white search field', () => {
    expect(hex('--header-search-bg')).toBe('#FFFFFF');
    expect(contrast(hex('--header-search-fg'), hex('--header-search-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('count badge text is at least 4.5:1 on its pill', () => {
    expect(contrast(hex('--header-badge-fg'), hex('--header-badge-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--promo-from', '--promo-to'])('sale banner text on %s is at least 4.5:1', (end) => {
    expect(contrast(hex('--promo-fg'), hex(end))).toBeGreaterThanOrEqual(4.5);
  });

  it('sale banner button text is at least 4.5:1', () => {
    expect(contrast(hex('--promo-cta-fg'), hex('--promo-cta-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the "Хиты" band is at least 4.5:1 (primary and secondary)', () => {
    expect(contrast(hex('--hits-text'), hex('--hits-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('--hits-text-secondary'), hex('--hits-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on accent surfaces (chips, discount badge, count pill) is at least 4.5:1', () => {
    expect(contrast(hex('--color-on-accent'), hex('--color-accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('"Новинка" badge text is at least 4.5:1', () => {
    expect(contrast(hex('--color-badge-new-fg'), hex('--color-badge-new-bg'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the two variants really differ', () => {
  it('header gradient and the "Хиты" band are different in A and B', () => {
    const a = resolveTokens('a', 'light');
    const b = resolveTokens('b', 'light');
    expect(a['--header-from']).not.toBe(b['--header-from']);
    expect(a['--header-to']).not.toBe(b['--header-to']);
    expect(hexOf(a, '--hits-bg')).toBe('#F7F5F3');
    expect(hexOf(b, '--hits-bg')).toBe('#2A2226');
  });

  it('has the documented terracotta start of A and a lighter-than-white-text bound', () => {
    const a = resolveTokens('a', 'light');
    // Pure brand terracotta (#C17A54) with white text is ~3.4:1 - that is why the gradient starts darker.
    expect(contrast('#FFFFFF', '#C17A54')).toBeLessThan(4.5);
    expect(contrast(hexOf(a, '--header-fg'), hexOf(a, '--header-from'))).toBeGreaterThanOrEqual(4.5);
  });
});
