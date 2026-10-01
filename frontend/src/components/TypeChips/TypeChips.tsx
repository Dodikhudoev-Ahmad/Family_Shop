import './TypeChips.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../../i18n/labels';

interface TypeChipsProps {
  types: string[];
  value: string | null;
  onChange: (type: string | null) => void;
}

/** Mobile-only horizontal quick filter by product type within the current category. */
export function TypeChips({ types, value, onChange }: TypeChipsProps) {
  const { t } = useTranslation();
  const { productType: typeName } = useLabels();
  if (types.length < 2) return null;

  return (
    <div className="type-chips" role="group" aria-label={t('filters.typeAria')}>
      <div className="type-chips__list">
        {[null, ...types].map((type) => (
          <button
            key={type ?? 'all'}
            type="button"
            className={`type-chips__chip ${value === type ? 'is-active' : ''}`}
            aria-pressed={value === type}
            onClick={() => onChange(type)}
          >
            {type ? typeName(type) : t('common.all')}
          </button>
        ))}
      </div>
    </div>
  );
}
