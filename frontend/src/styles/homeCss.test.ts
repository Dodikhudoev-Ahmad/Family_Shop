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

// The bottom bar is solid and the page reserves exactly its height (plus the safe area) at the bottom.
describe('mobile bottom bar does not cover content', () => {
  const bar = src('components/MobileTabBar/MobileTabBar.css');
  // The last rule for the selector: the phone one inside the media query follows the desktop `display: none`.
  const rule = (css: string, selector: string) => {
    const escaped = selector.replace(/\./g, '\\.');
    return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].pop()?.[1] ?? '';
  };

  it('has an opaque background from a token (no translucency, no backdrop blur)', () => {
    const body = rule(bar, '.mobile-tabbar');
    expect(body).toMatch(/background:\s*var\(--color-bg\)\s*;/);
    expect(bar).not.toMatch(/color-mix\([^)]*transparent/);
    expect(bar).not.toContain('backdrop-filter');
  });

  it('is docked to the bottom edge and grows by the safe area', () => {
    const body = rule(bar, '.mobile-tabbar');
    expect(body).toMatch(/bottom:\s*0;/);
    expect(body).toMatch(/env\(safe-area-inset-bottom/);
  });

  it('--tabbar-clearance is the bar height plus the safe area', () => {
    expect(src('styles/tokens.css')).toMatch(
      /--tabbar-clearance:\s*calc\(var\(--tabbar-height\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\);/
    );
  });

  it('the app shell and the bottom-heavy pages pad by the clearance on phones', () => {
    const index = src('index.css');
    expect(index).toMatch(/\.app-shell\s*\{[^}]*padding-bottom:\s*var\(--tabbar-clearance\)/);
    expect(index).toMatch(/\.checkout\s*\{[^}]*padding-bottom:\s*calc\(var\(--space-8\)\s*\+\s*var\(--tabbar-clearance\)\)/);
  });

  it('the back-to-top button sits above the bar', () => {
    expect(src('components/BackToTop/BackToTop.css')).toContain('var(--tabbar-clearance)');
  });
});

// The header stays sticky only while no ancestor makes its own scroll container / containing block (docs/Design.md, section 2).
describe('sticky header', () => {
  it('html and body clip horizontal overflow instead of hiding it', () => {
    const css = src('styles/global.css');
    for (const rule of css.match(/(^|\n)(html|body)\s*{[^}]*}/g) ?? []) {
      expect(rule).not.toMatch(/overflow(-x|-y)?:\s*(hidden|auto|scroll)/);
    }
  });

  it('.header-stack is sticky to the top and above the content', () => {
    const rule = src('components/layout/Header.css').match(/\.header-stack\s*{[^}]*}/)![0];
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/top:\s*0/);
    expect(rule).toMatch(/z-index:\s*100/);
  });

  it('the app shell around it has no overflow, transform or contain', () => {
    const css = src('index.css');
    const shell = css.match(/\.app-shell\s*{[^}]*}/g)?.join('') ?? '';
    expect(shell).not.toMatch(/overflow|transform|contain:/);
  });
});
