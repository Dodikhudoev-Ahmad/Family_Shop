import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './SizeSelector.css';

interface SizeSelectorProps {
  /** The whole grid of the product's type. */
  gridSizes: string[];
  /** The sizes that can be bought; the rest of the grid is shown muted and crossed out. */
  sizes: string[];
  selected: string | null;
  onSelect: (size: string) => void;
  /** Pressing an unavailable size (it stays focusable via aria-disabled): the parent explains why. */
  onUnavailable?: (size: string) => void;
  /** Extra content inside a size button (the product page's in-cart badge). */
  renderBadge?: (size: string) => ReactNode;
  /** Extra class names for the product page's own layout. */
  className?: string;
}

/** The size buttons of the product page and of the quick view: one source of markup, states and styles. */
export function SizeSelector({ gridSizes, sizes, selected, onSelect, onUnavailable, renderBadge, className }: SizeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className={`size-selector ${className ?? ''}`.trim()}>
      {gridSizes.map((size) => {
        const unavailable = !sizes.includes(size);
        const isSelected = selected === size;
        const inCart = renderBadge?.(size);
        // aria-disabled (not disabled) keeps an unavailable size focusable: a screen reader reads it as
        // unavailable, and pressing it explains why instead of doing nothing.
        return (
          <button
            key={size}
            type="button"
            className={`size-btn ${isSelected ? 'is-selected' : ''} ${inCart ? 'has-in-cart' : ''} ${unavailable ? 'is-unavailable' : ''}`}
            aria-pressed={isSelected}
            aria-disabled={unavailable || undefined}
            aria-label={unavailable ? t('product.sizeUnavailableAria', { size }) : undefined}
            onClick={() => (unavailable ? onUnavailable?.(size) : onSelect(size))}
          >
            {size}
            {inCart}
          </button>
        );
      })}
    </div>
  );
}
