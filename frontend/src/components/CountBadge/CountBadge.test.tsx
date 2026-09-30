import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountBadge, formatBadgeCount } from './CountBadge';

describe('CountBadge', () => {
  it('renders nothing for an empty count', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the number as-is up to 99 and 99+ above', () => {
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    render(<CountBadge count={250} className="x" />);
    expect(screen.getByText('99+')).toHaveClass('count-badge', 'x');
  });
});
