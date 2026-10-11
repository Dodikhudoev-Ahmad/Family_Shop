import { useTranslation } from 'react-i18next';
import { formatPrice } from '../../utils/formatPrice';
import './PriceRangeSlider.css';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function PriceRangeSlider({ min, max, value, onChange }: PriceRangeSliderProps) {
  const { t } = useTranslation();
  const [from, to] = value;

  return (
    <div className="price-slider">
      <div className="price-slider__values">
        <span>{formatPrice(from)}</span>
        <span>{formatPrice(to)}</span>
      </div>
      <div className="price-slider__track">
        <input
          type="range"
          aria-label={t('filters.priceFrom')}
          min={min}
          max={max}
          value={from}
          onChange={(e) => onChange([Math.min(Number(e.target.value), to), to])}
        />
        <input
          type="range"
          aria-label={t('filters.priceTo')}
          min={min}
          max={max}
          value={to}
          onChange={(e) => onChange([from, Math.max(Number(e.target.value), from)])}
        />
      </div>
    </div>
  );
}
