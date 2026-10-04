/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SizeSelector } from './SizeSelector';

afterEach(cleanup);

// Stylesheets read from disk as text (vitest hands css imports back empty).
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const sizeCss = read('./SizeSelector.css');
const quickViewCss = read('../QuickView/QuickViewModal.css');
const tokens = read('../../styles/tokens.css');

const GRID = ['S', 'M', 'L', 'XL'];
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.size-btn')];

describe('SizeSelector - selected state', () => {
  it('marks only the selected size (is-selected, aria-pressed), the others are not pressed', () => {
    render(<SizeSelector gridSizes={GRID} sizes={GRID} selected="M" onSelect={vi.fn()} />);
    expect(buttons().filter((b) => b.classList.contains('is-selected')).map((b) => b.textContent)).toEqual(['M']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('nothing is selected when selected is null', () => {
    render(<SizeSelector gridSizes={GRID} sizes={GRID} selected={null} onSelect={vi.fn()} />);
    expect(buttons().some((b) => b.classList.contains('is-selected'))).toBe(false);
  });

  it('an unavailable size never reports selected and calls onUnavailable, not onSelect', () => {
    const onSelect = vi.fn();
    const onUnavailable = vi.fn();
    render(<SizeSelector gridSizes={GRID} sizes={['M']} selected="M" onSelect={onSelect} onUnavailable={onUnavailable} />);
    const s = buttons()[0];
    expect(s.getAttribute('aria-disabled')).toBe('true');
    expect(s.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(s);
    expect(onUnavailable).toHaveBeenCalledWith('S');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// jsdom does not apply stylesheets, so the selected look is checked from the sources: the rule must use the theme
// tokens, and the tokens must give WCAG AA (4.5:1) text on the accent in both themes.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lightBlock = tokens.slice(0, tokens.indexOf("[data-theme='dark']"));
const darkBlock = tokens.slice(tokens.indexOf("[data-theme='dark']"));
const token = (block: string, name: string) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1] as string;

describe('SizeSelector - selected look', () => {
  const rule = /\.size-btn\.is-selected\s*\{([^}]*)\}/.exec(sizeCss)?.[1] ?? '';

  it('uses theme tokens only (accent background, on-accent text), no hard-coded colours', () => {
    expect(rule).toContain('background: var(--color-accent)');
    expect(rule).toContain('color: var(--color-on-accent)');
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(quickViewCss).not.toContain('.size-btn.is-selected');
  });

  it.each([
    ['light', lightBlock],
    ['dark', darkBlock],
  ])('text on the accent has contrast >= 4.5:1 in the %s theme', (_name, block) => {
    expect(contrast(token(block, '--color-on-accent'), token(block, '--color-accent'))).toBeGreaterThanOrEqual(4.5);
  });
});
