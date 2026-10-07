// Test helper: resolves the design tokens of styles/tokens.css for a "variant × theme" combination,
// applying the selector blocks in file order (the order the cascade uses for equal specificity).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Variant = 'a' | 'b';
export type Theme = 'light' | 'dark';

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function selectorApplies(selector: string, variant: Variant, theme: Theme): boolean {
  const wantsDark = selector.includes("data-theme='dark'");
  const wantsB = selector.includes("data-variant='b'");
  if (wantsDark && theme !== 'dark') return false;
  if (wantsB && variant !== 'b') return false;
  return true;
}

export function resolveTokens(variant: Variant, theme: Theme): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, selector, body] of css.matchAll(/(:root[^{@]*)\{([^{}]*)\}/g)) {
    if (!selectorApplies(selector.trim(), variant, theme)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
  }
  return tokens;
}

/** Value of a token as a #RRGGBB string; follows var(--other) references. */
export function hexOf(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  for (let i = 0; i < 5 && value?.startsWith('var('); i++) value = tokens[value.slice(4, -1).trim()];
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${name} is not a hex colour: ${value}`);
  return value.toUpperCase();
}

const channel = (hex: string, i: number) => {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
