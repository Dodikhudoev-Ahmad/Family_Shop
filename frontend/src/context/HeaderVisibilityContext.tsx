import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface HeaderVisibilityValue {
  /** True once the page has scrolled past the "compact" threshold - drives the header's
   * shorter height and its shadow/border while scrolled. */
  isCompact: boolean;
  /** True when the header (and, on mobile, the category strip stacked under it) should be
   * translated out of view. Never true while an overlay that's anchored to the header
   * (search, the burger drawer, the desktop mega menu) is open. */
  isHidden: boolean;
  /** Registers that some header-anchored overlay is open/closed under `key`, so the header
   * stays put while it's up - closing the search box mid-scroll shouldn't yank the header
   * away right as the user is still looking at it. */
  setOverlayOpen: (key: string, isOpen: boolean) => void;
}

const HeaderVisibilityContext = createContext<HeaderVisibilityValue | null>(null);

// Below this scrollY the header always stays visible, hidden or not - there is no point
// hiding it a few pixels into the page, and it keeps the very top of the page stable.
const HIDE_START = 80;
// Height/shadow only kick in a little further down, past the hero/banner area on most pages.
const COMPACT_START = 100;
// A trackpad/wheel scroll doesn't land on its target in one jump - Chromium (and real trackpad
// momentum) settles into it over a dozen-odd scroll events that count *down* by a few px each
// even on a purely downward swipe (measured: a single 600px downward wheel scroll settles back
// up by ~24px over the next ~1s). Comparing every sample to the one right before it reads that
// settle wobble as "scrolling up" and flips the header back on mid-gesture. Comparing instead to
// an anchor that only moves once a real direction change clears this deadzone absorbs the wobble
// without needing a large, laggy-feeling threshold for genuine up/down scrolls.
const DIRECTION_DEADZONE = 32;

export function HeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [isCompact, setIsCompact] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const openOverlays = useRef(new Set<string>());

  const setOverlayOpen = useCallback((key: string, isOpen: boolean) => {
    if (isOpen) {
      openOverlays.current.add(key);
      setIsHidden(false);
    } else {
      openOverlays.current.delete(key);
    }
  }, []);

  useEffect(() => {
    // The point we last made a hide/show decision from - only this, not every intermediate
    // sample, is what new samples are compared against (see DIRECTION_DEADZONE above).
    let anchorY = window.scrollY;

    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setIsCompact(y > COMPACT_START);

      if (openOverlays.current.size > 0 || y <= HIDE_START) {
        setIsHidden(false);
        anchorY = y;
        return;
      }

      const delta = y - anchorY;
      if (delta > DIRECTION_DEADZONE) {
        setIsHidden(true); // scrolled down past the deadzone - tuck the header away
        anchorY = y;
      } else if (delta < -DIRECTION_DEADZONE) {
        setIsHidden(false); // scrolled up past the deadzone - bring it back
        anchorY = y;
      }
      // else: within the deadzone - a real direction change hasn't cleared it yet, so leave
      // both the anchor and the current visibility alone.
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const value = useMemo(() => ({ isCompact, isHidden, setOverlayOpen }), [isCompact, isHidden, setOverlayOpen]);

  return <HeaderVisibilityContext.Provider value={value}>{children}</HeaderVisibilityContext.Provider>;
}

export function useHeaderVisibility() {
  const ctx = useContext(HeaderVisibilityContext);
  if (!ctx) throw new Error('useHeaderVisibility must be used within HeaderVisibilityProvider');
  return ctx;
}
