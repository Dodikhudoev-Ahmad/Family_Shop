import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useJsonLd } from './useJsonLd';
import type { JsonLdObject } from '../utils/jsonLd';

function Probe({ blocks }: { blocks: (JsonLdObject | null)[] }) {
  useJsonLd(blocks);
  return null;
}

const scripts = () => Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));

afterEach(() => {
  document.head.innerHTML = '';
});

describe('useJsonLd', () => {
  it('adds one valid script per block and removes them on unmount', () => {
    const { unmount } = render(<Probe blocks={[{ '@type': 'A' }, null, { '@type': 'B' }]} />);
    expect(scripts().map((s) => JSON.parse(s.textContent ?? '')['@type'])).toEqual(['A', 'B']);
    unmount();
    expect(scripts()).toHaveLength(0);
  });

  it('replaces the previous blocks when the data changes (no stale Product left behind)', () => {
    const { rerender } = render(<Probe blocks={[{ '@type': 'Product', name: 'one' }]} />);
    rerender(<Probe blocks={[{ '@type': 'Product', name: 'two' }]} />);
    expect(scripts()).toHaveLength(1);
    expect(JSON.parse(scripts()[0].textContent ?? '').name).toBe('two');
  });

  it('a hostile name stays inside one script element', () => {
    render(<Probe blocks={[{ name: '</script><img src=x onerror=alert(1)>' }]} />);
    expect(scripts()).toHaveLength(1);
    expect(document.head.querySelector('img')).toBeNull();
    expect(JSON.parse(scripts()[0].textContent ?? '').name).toBe('</script><img src=x onerror=alert(1)>');
  });
});
