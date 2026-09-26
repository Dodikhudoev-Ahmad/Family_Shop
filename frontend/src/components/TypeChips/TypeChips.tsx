import './TypeChips.css';

interface TypeChipsProps {
  types: string[];
  value: string | null;
  onChange: (type: string | null) => void;
}

/** Mobile-only horizontal quick filter by product type within the current category. */
export function TypeChips({ types, value, onChange }: TypeChipsProps) {
  if (types.length < 2) return null;

  return (
    <div className="type-chips" role="group" aria-label="Тип товара">
      <div className="type-chips__list">
        {[null, ...types].map((type) => (
          <button
            key={type ?? 'all'}
            type="button"
            className={`type-chips__chip ${value === type ? 'is-active' : ''}`}
            aria-pressed={value === type}
            onClick={() => onChange(type)}
          >
            {type ?? 'Все'}
          </button>
        ))}
      </div>
    </div>
  );
}
