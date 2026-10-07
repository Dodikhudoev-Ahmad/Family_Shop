import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHomeVariant, useHomeVariant } from './homeVariant';

function Probe() {
  return <span data-testid="v">{useHomeVariant()}</span>;
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  );

beforeEach(() => {
  sessionStorage.clear();
  delete document.documentElement.dataset.variant;
});
afterEach(cleanup);

describe('resolveHomeVariant', () => {
  it('defaults to a', () => {
    expect(resolveHomeVariant('', null)).toBe('a');
  });

  it('reads ?variant=a and ?variant=b', () => {
    expect(resolveHomeVariant('?variant=a', null)).toBe('a');
    expect(resolveHomeVariant('?variant=b', null)).toBe('b');
  });

  it('treats an unknown value as the default, even if another variant was remembered', () => {
    expect(resolveHomeVariant('?variant=zzz', 'b')).toBe('a');
    expect(resolveHomeVariant('?variant=B', 'b')).toBe('a');
  });

  it('falls back to the remembered variant when there is no parameter', () => {
    expect(resolveHomeVariant('?x=1', 'b')).toBe('b');
  });

  it('lets the parameter override the remembered variant', () => {
    expect(resolveHomeVariant('?variant=a', 'b')).toBe('a');
  });
});

describe('useHomeVariant', () => {
  it('publishes data-variant on <html> and remembers it for the tab', () => {
    renderAt('/?variant=b');
    expect(document.documentElement.dataset.variant).toBe('b');
    expect(sessionStorage.getItem('family-shop:home-variant')).toBe('b');
  });

  it('keeps the variant on a later page without the parameter', () => {
    renderAt('/?variant=b');
    cleanup();
    renderAt('/catalog');
    expect(document.documentElement.dataset.variant).toBe('b');
  });

  it('uses a with no parameter and nothing remembered', () => {
    renderAt('/');
    expect(document.documentElement.dataset.variant).toBe('a');
  });

  it('still works when sessionStorage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/?variant=b');
    expect(document.documentElement.dataset.variant).toBe('b');
    get.mockRestore();
    set.mockRestore();
  });
});
