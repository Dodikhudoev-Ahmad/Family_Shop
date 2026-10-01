import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../../types/product';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../../i18n/labels';

interface CategoryMegaMenuProps {
  categories: Category[];
  isLoading: boolean;
  /** Reports open/close so the sticky header can stay put while the menu is open. */
  onOpenChange?: (isOpen: boolean) => void;
}

// The catalog is flat (no real subcategories yet), so the mega menu groups the
// existing top-level categories into themed columns purely for browsing —
// "Одежда"/"Дом"/"Спорт и аксессуары" aren't real categories, just labels.
const GROUPS = [
  { label: 'clothing', slugs: ['women', 'men', 'kids'] },
  { label: 'home', slugs: ['bytovaya-tehnika', 'posuda'] },
  { label: 'sportAccessories', slugs: ['sport', 'aksessuary'] },
] as const;

export function CategoryMegaMenu({ categories, isLoading, onOpenChange }: CategoryMegaMenuProps) {
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onOpenChange?.(isOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const openNow = () => {
    window.clearTimeout(closeTimeoutRef.current);
    setIsOpen(true);
  };

  // Small delay so moving the cursor from the trigger to the panel (or between
  // columns) doesn't close the menu the instant it leaves the trigger's box.
  const closeSoon = () => {
    closeTimeoutRef.current = window.setTimeout(() => setIsOpen(false), 150);
  };

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isOpen]);

  useEffect(() => () => window.clearTimeout(closeTimeoutRef.current), []);

  const byslug = new Map(categories.map((c) => [c.slug, c]));

  return (
    <div className="header__catalog" ref={containerRef} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        className="header__nav-link header__catalog-trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        {t('nav.catalog')}
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`mega-menu-overlay ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />

      <div className={`mega-menu ${isOpen ? 'is-open' : ''}`}>
        {isLoading ? (
          <div className="mega-menu__grid">
            {GROUPS.map((_, i) => (
              <div className="mega-menu__col" key={i}>
                <span className="skeleton mega-menu__skeleton-title" />
                <span className="skeleton mega-menu__skeleton-line" />
                <span className="skeleton mega-menu__skeleton-line" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mega-menu__grid">
            {GROUPS.map((group, i) => {
              const items = group.slugs.map((slug) => byslug.get(slug)).filter((c): c is Category => Boolean(c));
              if (items.length === 0) return null;

              return (
                <div className="mega-menu__col" key={i}>
                  <span className="mega-menu__col-title">
                    {t(`nav.groups.${group.label}`)}
                    <ChevronRightIcon />
                  </span>
                  <ul className="mega-menu__list">
                    {items.map((c) => (
                      <li key={c.id}>
                        <Link to={`/catalog/${c.slug}`} onClick={() => setIsOpen(false)}>
                          {categoryName(c)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`header__catalog-chevron ${isOpen ? 'is-open' : ''}`}>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Marks a column heading as having a subcategory list below it.
function ChevronRightIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="mega-menu__col-chevron">
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
