import { useTranslation } from 'react-i18next';
import { QUICK_FILTERS, type QuickFilter } from '../../utils/productFlags';
import './QuickChips.css';

interface QuickChipsProps {
  value: QuickFilter;
  onChange: (next: QuickFilter) => void;
}

/** "Скидки / Новинки / Хиты": one is always selected; buttons with aria-pressed, reachable by keyboard. */
export function QuickChips({ value, onChange }: QuickChipsProps) {
  const { t } = useTranslation();
  return (
    <div className="quick-chips" role="group" aria-label={t('home.chips.label')}>
      {QUICK_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className={`quick-chips__chip ${value === filter ? 'is-active' : ''}`}
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          {t(`home.chips.${filter}`)}
        </button>
      ))}
    </div>
  );
}
