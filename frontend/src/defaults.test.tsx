import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import indexHtml from '../index.html?raw';

// A visitor whose phone is in dark mode and whose browser speaks Kazakh/English: the shop must
// still open light and in Russian. These tests simulate exactly that device.
function simulateDevice({ dark, browserLanguage }: { dark: boolean; browserLanguage: string }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? dark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(browserLanguage);
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([browserLanguage]);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} data-testid="theme">
      {theme}
    </button>
  );
}

describe('first visit (clean storage)', () => {
  it('opens in the light theme even when the device prefers dark', () => {
    simulateDevice({ dark: true, browserLanguage: 'kk-KZ' });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('remembers a switch to dark, and a saved "dark" wins on the next visit', async () => {
    simulateDevice({ dark: false, browserLanguage: 'ru-RU' });
    const { unmount } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    screen.getByTestId('theme').click();
    await vi.waitFor(() => expect(localStorage.getItem('theme')).toBe('dark'));
    unmount();
    document.documentElement.removeAttribute('data-theme');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('opens in Russian regardless of the browser language', async () => {
    simulateDevice({ dark: false, browserLanguage: 'en-US' });
    const { default: i18n } = await import('./i18n');
    expect(i18n.language).toBe('ru');
    expect(i18n.t('nav.cart')).toBe('Корзина');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('ignores a corrupted saved language and falls back to Russian', async () => {
    localStorage.setItem('family-shop:lang', 'de');
    const { default: i18n } = await import('./i18n');
    expect(i18n.language).toBe('ru');
  });
});

describe('inline theme script in index.html (runs before the first paint)', () => {
  const html = indexHtml;
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const run = () => new Function(script)();

  it('is covered by the CSP hash, so the browser will actually run it', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(html).toContain(`'sha256-${hash}'`);
  });

  it('sets light on a first visit, even on a dark-mode device', () => {
    simulateDevice({ dark: true, browserLanguage: 'ru-RU' });
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies only an explicitly saved "dark"; anything else is light', () => {
    simulateDevice({ dark: false, browserLanguage: 'ru-RU' });
    localStorage.setItem('theme', 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    localStorage.setItem('theme', 'purple');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to light when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
