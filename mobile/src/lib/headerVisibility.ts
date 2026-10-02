/**
 * The "smart header" rule of the website (HeaderVisibilityContext), as a pure function so it can be tested:
 * hidden on scroll down once past 80px, back at once on scroll up, always visible near the top or while an overlay
 * anchored to it is open. The direction is judged against the point of the LAST DECISION, not the previous sample,
 * and only after a 32px deadzone: a wheel/trackpad scroll settles with small wobbles in the opposite direction that
 * would otherwise flip the header mid-gesture.
 */
export const HIDE_START = 80;
export const DIRECTION_DEADZONE = 32;

export interface HeaderVisibility {
  hidden: boolean;
  /** The scroll offset the last hide/show decision was made at. */
  anchorY: number;
}

export const INITIAL_HEADER_VISIBILITY: HeaderVisibility = { hidden: false, anchorY: 0 };

export function nextHeaderVisibility(prev: HeaderVisibility, y: number, overlayOpen: boolean): HeaderVisibility {
  // Near the top (including the rubber-band overscroll above 0) and under an open overlay: always visible.
  if (overlayOpen || y <= HIDE_START) return { hidden: false, anchorY: y };

  const delta = y - prev.anchorY;
  if (delta > DIRECTION_DEADZONE) return { hidden: true, anchorY: y };
  if (delta < -DIRECTION_DEADZONE) return { hidden: false, anchorY: y };
  return prev; // inside the deadzone: neither the anchor nor the visibility changes
}
