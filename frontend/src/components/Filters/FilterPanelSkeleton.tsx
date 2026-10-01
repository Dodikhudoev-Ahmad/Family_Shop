import './FilterPanel.css';
import './FilterPanelSkeleton.css';
import { useTranslation } from 'react-i18next';

export function FilterPanelSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="filter-panel">
      <div className="filter-panel__group">
        <h4 className="filter-panel__title">{t('filters.category')}</h4>
        <div className="filter-panel__chips">
          {[64, 84, 76, 68, 96].map((w, i) => (
            <span key={i} className="skeleton filter-panel-skeleton__chip" style={{ width: w }} />
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">{t('filters.size')}</h4>
        <div className="filter-panel__chips">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="skeleton filter-panel-skeleton__chip filter-panel-skeleton__chip--square" />
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">{t('filters.price')}</h4>
        <span className="skeleton filter-panel-skeleton__line" />
        <span className="skeleton filter-panel-skeleton__track" />
      </div>

      <span className="skeleton filter-panel-skeleton__checkbox" />
    </div>
  );
}
