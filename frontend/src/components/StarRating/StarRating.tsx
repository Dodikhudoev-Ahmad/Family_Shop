import { useState } from 'react';
import './StarRating.css';

interface StarRatingProps {
  /** Rating value, 0-5. Can be fractional in read-only mode (e.g. an average of 4.33). */
  value: number;
  size?: 'sm' | 'md' | 'lg';
  /** Interactive star picker (click to set value) instead of a static display. */
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export function StarRating({ value, size = 'md', interactive = false, onChange }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = interactive && hoverValue !== null ? hoverValue : value;

  if (interactive) {
    return (
      <div
        className={`star-rating star-rating--${size} star-rating--interactive`}
        role="radiogroup"
        aria-label="Оценка"
        onMouseLeave={() => setHoverValue(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} из 5`}
            className={`star-rating__btn ${star <= displayValue ? 'is-filled' : ''}`}
            onMouseEnter={() => setHoverValue(star)}
            onClick={() => onChange?.(star)}
          >
            <StarIcon />
          </button>
        ))}
      </div>
    );
  }

  const percent = Math.max(0, Math.min(1, value / 5)) * 100;

  return (
    <span className={`star-rating star-rating--${size}`} aria-label={`Рейтинг ${value.toFixed(1)} из 5`}>
      <span className="star-rating__track">
        <StarIcons />
        <span className="star-rating__fill" style={{ width: `${percent}%` }}>
          <StarIcons />
        </span>
      </span>
    </span>
  );
}

function StarIcons() {
  return (
    <span className="star-rating__row">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon key={star} />
      ))}
    </span>
  );
}

function StarIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.77l-5.18 2.67.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
    </svg>
  );
}
