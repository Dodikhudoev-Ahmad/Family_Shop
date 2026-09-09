import { formatPrice } from '../../utils/formatPrice';
import './PriceRangeSlider.css';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function PriceRangeSlider({ min, max, value, onChange }: PriceRangeSliderProps) {
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
          min={min}
          max={max}
          value={from}
          onChange={(e) => onChange([Math.min(Number(e.target.value), to), to])}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={to}
          onChange={(e) => onChange([from, Math.max(Number(e.target.value), from)])}
        />
      </div>
    </div>
  );
}
