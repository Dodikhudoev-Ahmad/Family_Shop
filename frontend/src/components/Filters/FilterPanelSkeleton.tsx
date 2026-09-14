import './FilterPanel.css';
import './FilterPanelSkeleton.css';

export function FilterPanelSkeleton() {
  return (
    <div className="filter-panel">
      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Категория</h4>
        <div className="filter-panel__chips">
          {[64, 84, 76, 68, 96].map((w, i) => (
            <span key={i} className="skeleton filter-panel-skeleton__chip" style={{ width: w }} />
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Размер</h4>
        <div className="filter-panel__chips">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="skeleton filter-panel-skeleton__chip filter-panel-skeleton__chip--square" />
          ))}
        </div>
      </div>

      <div className="filter-panel__group">
        <h4 className="filter-panel__title">Цена</h4>
        <span className="skeleton filter-panel-skeleton__line" />
        <span className="skeleton filter-panel-skeleton__track" />
      </div>

      <span className="skeleton filter-panel-skeleton__checkbox" />
    </div>
  );
}
