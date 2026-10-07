import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The mobile column count is one token (styles/tokens.css); changing it to 1 brings back one card per row.
describe('mobile grid flag', () => {
  const GRID_FILES = ['components/Slider/Slider.css', 'pages/CatalogPage.css', 'pages/FavoritesPage.css', 'pages/HomePage.css'];

  it('is a token, set to 2 columns', () => {
    expect(src('styles/tokens.css')).toMatch(/--grid-cols-mobile:\s*2;/);
  });

  it.each(GRID_FILES)('%s takes the column count from the token, not a literal', (file) => {
    const css = src(file);
    expect(css).toContain('repeat(var(--grid-cols-mobile)');
    expect(css).not.toMatch(/repeat\(\s*[12]\s*,\s*(1fr|minmax)/);
  });
});

// Components carry no colours of their own: everything is a token, so both themes and both variants work.
describe('no hard-coded colours in the redesigned components', () => {
  const FILES = [
    'components/layout/Header.css',
    'components/CategoryStrip/CategoryStrip.css',
    'components/MobileTabBar/MobileTabBar.css',
    'components/HomeBand/HomeBand.css',
    'components/SaleBanner/SaleBanner.css',
    'components/QuickChips/QuickChips.css',
    'components/CountBadge/CountBadge.css',
  ];
  const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

  it.each(FILES)('%s', (file) => {
    expect(src(file)).not.toMatch(LITERAL_COLOUR);
  });
});

describe('accent surfaces never carry white text', () => {
  it.each(['components/QuickChips/QuickChips.css', 'components/CountBadge/CountBadge.css', 'components/ProductCard/ProductCard.css'])(
    '%s',
    (file) => {
      const css = src(file);
      // A rule that paints --color-accent as background must not also set --color-white as text colour.
      for (const [, body] of css.matchAll(/\{([^{}]*)\}/g)) {
        if (/background:\s*var\(--color-accent\)/.test(body)) expect(body).not.toMatch(/[^-]color:\s*var\(--color-white\)/);
      }
    }
  );
});
