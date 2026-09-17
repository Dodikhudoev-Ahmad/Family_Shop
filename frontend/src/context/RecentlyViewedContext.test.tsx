import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { RecentlyViewedProvider, useRecentlyViewed } from './RecentlyViewedContext';

function wrapper({ children }: { children: ReactNode }) {
  return <RecentlyViewedProvider>{children}</RecentlyViewedProvider>;
}

describe('RecentlyViewedContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useRecentlyViewed(), { wrapper });
    expect(result.current.recentIds).toEqual([]);
  });

  it('adds a viewed product id to the front of the list', () => {
    const { result } = renderHook(() => useRecentlyViewed(), { wrapper });

    act(() => result.current.addViewed('1'));
    act(() => result.current.addViewed('2'));

    expect(result.current.recentIds).toEqual(['2', '1']);
  });

  it('moves an already-viewed id to the front instead of duplicating it', () => {
    const { result } = renderHook(() => useRecentlyViewed(), { wrapper });

    act(() => result.current.addViewed('1'));
    act(() => result.current.addViewed('2'));
    act(() => result.current.addViewed('3'));
    act(() => result.current.addViewed('1'));

    expect(result.current.recentIds).toEqual(['1', '3', '2']);
  });

  it('caps the list at 12 items, dropping the oldest', () => {
    const { result } = renderHook(() => useRecentlyViewed(), { wrapper });

    act(() => {
      for (let i = 1; i <= 15; i++) {
        result.current.addViewed(String(i));
      }
    });

    expect(result.current.recentIds).toHaveLength(12);
    expect(result.current.recentIds[0]).toBe('15');
    expect(result.current.recentIds).not.toContain('1');
    expect(result.current.recentIds).not.toContain('2');
    expect(result.current.recentIds).not.toContain('3');
  });

  it('persists to localStorage and rehydrates on next mount', () => {
    const { result, unmount } = renderHook(() => useRecentlyViewed(), { wrapper });

    act(() => result.current.addViewed('42'));
    unmount();

    const { result: result2 } = renderHook(() => useRecentlyViewed(), { wrapper });
    expect(result2.current.recentIds).toEqual(['42']);
  });
});
