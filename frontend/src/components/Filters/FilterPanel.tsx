import { useCategories } from '../../context/CategoriesContext';
import { PriceRangeSlider } from '../PriceRangeSlider/PriceRangeSlider';
import './FilterPanel.css';

export interface Filters {
  categoryId: string | null;
  size: string | null;
  priceRange: [number, number];
  discountOnly: boolean;
}

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  availableSizes: string[];
  priceBounds: [number, number];
}

export function FilterPanel({ filters, onChange, availableSizes, priceBounds }: FilterPanelProps) {
  const { categories } = useCategories();

  return (
    <div className="filter-panel">
      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Категория</h4>
        <div className="filter-panel__chips">
          <button
            className={`filter-chip ${filters.categoryId === null ? 'is-active' : ''}`}
            onClick={() => onChange({ ...filters, categoryId: null })}
          >
            Все
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`filter-chip ${filters.categoryId === c.id ? 'is-active' : ''}`}
              onClick={() => onChange({ ...filters, categoryId: c.id })}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Размер</h4>
        <div className="filter-panel__chips">
          {availableSizes.map((size) => (
            <button
              key={size}
              className={`filter-chip filter-chip--square ${filters.size === size ? 'is-active' : ''}`}
              onClick={() => onChange({ ...filters, size: filters.size === size ? null : size })}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Цена</h4>
        <PriceRangeSlider
          min={priceBounds[0]}
          max={priceBounds[1]}
          value={filters.priceRange}
          onChange={(range) => onChange({ ...filters, priceRange: range })}
        />
      </div>

      <label className="filter-panel__checkbox">
        <input
          type="checkbox"
          checked={filters.discountOnly}
          onChange={(e) => onChange({ ...filters, discountOnly: e.target.checked })}
        />
        Только со скидкой
      </label>
    </div>
  );
}
