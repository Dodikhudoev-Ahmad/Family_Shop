import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HeaderVisibilityProvider, useHeaderVisibility } from './HeaderVisibilityContext';

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

describe('HeaderVisibilityContext', () => {
  beforeEach(() => {
    setScrollY(0);
  });

  it('stays visible near the top of the page regardless of scroll direction', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => setScrollY(40));

    await waitFor(() => expect(result.current.isHidden).toBe(false));
  });

  it('hides once the page scrolls down past the threshold', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => setScrollY(50)); // below the hide threshold - establishes a scroll baseline
    await waitFor(() => expect(result.current.isHidden).toBe(false));

    act(() => setScrollY(300)); // scrolling down, past the threshold
    await waitFor(() => expect(result.current.isHidden).toBe(true));
  });

  it('reappears immediately on any scroll-up, without waiting to reach the top', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => setScrollY(300));
    await waitFor(() => expect(result.current.isHidden).toBe(true));

    act(() => setScrollY(250)); // still deep in the page, just scrolling up
    await waitFor(() => expect(result.current.isHidden).toBe(false));
  });

  it('ignores the settle wobble after a fast downward wheel scroll (stays hidden)', async () => {
    // Reproduces a real measured Chromium wheel-scroll trace: mouse.wheel(0, 600) overshoots to
    // 600 then settles back down to 576 over a dozen-odd scroll events, each one a few px
    // *smaller* than the last. Comparing every sample to its immediate predecessor reads that
    // settle-back as "scrolling up" and incorrectly reveals the header mid-gesture.
    const settleTrace = [600, 597, 593, 589, 585, 582, 581, 579, 578, 577, 577, 576];
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    for (const y of settleTrace) {
      act(() => setScrollY(y));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(result.current.isCompact).toBe(true));
    }

    expect(result.current.isHidden).toBe(true);
  });

  it('marks isCompact once scrolled past the (separate, lower) compact threshold', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => setScrollY(150));

    await waitFor(() => expect(result.current.isCompact).toBe(true));
  });

  it('does not hide while a registered overlay (search/menu/mega menu) is open, even scrolling down', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => result.current.setOverlayOpen('search', true));
    act(() => setScrollY(300));

    await waitFor(() => expect(result.current.isCompact).toBe(true)); // scroll was processed
    expect(result.current.isHidden).toBe(false);
  });

  it('resumes hiding on the next scroll-down after the overlay closes', async () => {
    const { result } = renderHook(() => useHeaderVisibility(), { wrapper: HeaderVisibilityProvider });

    act(() => result.current.setOverlayOpen('search', true));
    act(() => setScrollY(300));
    act(() => result.current.setOverlayOpen('search', false));
    act(() => setScrollY(350));

    await waitFor(() => expect(result.current.isHidden).toBe(true));
  });
});
