import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, hexOf, resolveTokens, type Theme } from './tokenValues';

const THEMES: Theme[] = ['light', 'dark'];

describe.each(THEMES)('filled accent controls with white text, %s theme', (theme) => {
  const hex = (name: string) => hexOf(resolveTokens('a', theme), name);

  it('--accent-strong with white text is at least 4.5:1 (AA for 14px text)', () => {
    expect(contrast('#FFFFFF', hex('--accent-strong'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the hover fill (--accent-strong-hover) keeps 4.5:1 and is darker than the resting one', () => {
    expect(contrast('#FFFFFF', hex('--accent-strong-hover'))).toBeGreaterThan(contrast('#FFFFFF', hex('--accent-strong')));
    expect(contrast('#FFFFFF', hex('--accent-strong-hover'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the button shape stands out from the page (non-text contrast, at least 3:1)', () => {
    expect(contrast(hex('--accent-strong'), hex('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(contrast(hex('--accent-strong'), hex('--color-bg-secondary'))).toBeGreaterThanOrEqual(3);
  });

  it('accent-coloured button text (--accent-text) on the page backgrounds is at least 4.5:1', () => {
    expect(contrast(hex('--accent-text'), hex('--color-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('--accent-text'), hex('--color-bg-secondary'))).toBeGreaterThanOrEqual(4.5);
  });
});

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith('.css') ? [path] : [];
  });
}

describe('no rule paints white text on the plain accent', () => {
  it('white text is only used on --accent-strong*, never on --color-accent(-hover) (3.4:1)', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(resolve(__dirname, '..'))) {
      for (const [, selector, body] of readFileSync(file, 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const paintsAccent = /background(-color)?:\s*[^;]*var\(--color-accent(-hover)?\)/.test(body);
        const white = /(?<![-\w])color:\s*(var\(--color-white\)|#fff(fff)?\b)/i.test(body);
        if (paintsAccent && white) offenders.push(`${file.split('/src/')[1]}: ${selector.trim().replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
