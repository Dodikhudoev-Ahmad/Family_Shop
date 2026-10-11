import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text in the accent colour must use --accent-text (4.5:1 on the page backgrounds in both themes, see
// buttonContrast.test.ts); --color-accent itself is only 3.4:1 on white. Star glyphs are graphics, not text (3:1 is enough).
const ALLOWED = ['StarRating.css'];

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

describe('accent-coloured text', () => {
  it('uses --accent-text, never --color-accent, for the text colour', () => {
    const offenders = cssFiles(resolve(__dirname, '..'))
      .filter((file) => !ALLOWED.some((name) => file.endsWith(name)))
      .filter((file) => /^\s*color:\s*var\(--color-accent\)/m.test(readFileSync(file, 'utf8')));

    expect(offenders.map((f) => f.split('/src/')[1])).toEqual([]);
  });
});
