import type { SizeGrid } from '../../utils/sizeGrids';

interface Props {
  /** The grid of the chosen type, or null when the type has no sizes (appliances, dishes, bags...). */
  grid: SizeGrid | null;
  /** Whether a type has been chosen yet - without one there is no grid to show. */
  hasType: boolean;
  value: string[];
  onChange: (sizes: string[]) => void;
  error?: string;
}

/** The "Размеры" block of the product form: one checkbox per size of the grid, select all / clear all. A type without
 * sizes shows a note instead, and the form sends no sizes for it. */
export function ProductSizesField({ grid, hasType, value, onChange, error }: Props) {
  if (!hasType) {
    return (
      <fieldset className="admin-sizes">
        <legend>Размеры</legend>
        <p className="admin-sizes__note">Выберите тип товара — появится размерная сетка.</p>
      </fieldset>
    );
  }

  if (!grid) {
    return (
      <fieldset className="admin-sizes">
        <legend>Размеры</legend>
        <p className="admin-sizes__note">Для этого типа товаров размеры не используются</p>
      </fieldset>
    );
  }

  const toggle = (size: string) =>
    onChange(grid.sizes.filter((s) => (s === size ? !value.includes(s) : value.includes(s))));

  return (
    <fieldset className={`admin-sizes ${error ? 'has-error' : ''}`}>
      <legend>Размеры</legend>
      <div className="admin-sizes__head">
        <span className="admin-sizes__group">{grid.label}</span>
        <span className="admin-sizes__actions">
          <button type="button" onClick={() => onChange([...grid.sizes])}>
            Выбрать все
          </button>
          <button type="button" onClick={() => onChange([])}>
            Снять все
          </button>
        </span>
      </div>
      <div className="admin-sizes__grid" role="group" aria-label={grid.label}>
        {grid.sizes.map((size) => (
          <label key={size} className={`admin-sizes__item ${value.includes(size) ? 'is-checked' : ''}`}>
            <input type="checkbox" checked={value.includes(size)} onChange={() => toggle(size)} />
            <span>{size}</span>
          </label>
        ))}
      </div>
      <p className="admin-sizes__hint">Остаток на складе общий на товар, не по размерам.</p>
      {error && <span className="admin-form-field__error">{error}</span>}
    </fieldset>
  );
}
