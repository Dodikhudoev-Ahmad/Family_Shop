import './CountBadge.css';

/** Largest number shown as-is; anything above renders as "99+" so the pill stays compact. */
export const COUNT_BADGE_MAX = 99;

export function formatBadgeCount(count: number): string {
  return count > COUNT_BADGE_MAX ? `${COUNT_BADGE_MAX}+` : String(count);
}

interface CountBadgeProps {
  count: number;
  /** Positioning (and anything else context-specific) comes from the caller. */
  className?: string;
}

/** Small accent pill with an item count, e.g. on the cart/favorites icons. Renders nothing for 0. */
export function CountBadge({ count, className = '' }: CountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span className={`count-badge ${className}`.trim()} aria-label={`${count} шт`}>
      {formatBadgeCount(count)}
    </span>
  );
}
