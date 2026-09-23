import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../../types/product';

interface CategoryMegaMenuProps {
  categories: Category[];
  isLoading: boolean;
}

// The catalog is flat (no real subcategories yet), so the mega menu groups the
// existing top-level categories into themed columns purely for browsing —
// "Одежда"/"Дом"/"Спорт и аксессуары" aren't real categories, just labels.
// "Обувь и сумки" gets its own column since it doesn't fit either group; its
// bold title *is* the category link (no subcategories to list under it).
const GROUPS: { label: string | null; slugs: string[] }[] = [
  { label: 'Одежда', slugs: ['women', 'men', 'kids'] },
  { label: null, slugs: ['shoes-bags'] },
  { label: 'Дом', slugs: ['bytovaya-tehnika', 'posuda'] },
  { label: 'Спорт и аксессуары', slugs: ['sport', 'aksessuary'] },
];

export function CategoryMegaMenu({ categories, isLoading }: CategoryMegaMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | undefined>(undefined);

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
        Каталог
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

              if (group.label === null) {
                const only = items[0];
                return (
                  <div className="mega-menu__col" key={i}>
                    <Link to={`/catalog/${only.slug}`} className="mega-menu__col-title mega-menu__col-title--link" onClick={() => setIsOpen(false)}>
                      {only.name}
                    </Link>
                  </div>
                );
              }

              return (
                <div className="mega-menu__col" key={i}>
                  <span className="mega-menu__col-title">
                    {group.label}
                    <ChevronRightIcon />
                  </span>
                  <ul className="mega-menu__list">
                    {items.map((c) => (
                      <li key={c.id}>
                        <Link to={`/catalog/${c.slug}`} onClick={() => setIsOpen(false)}>
                          {c.name}
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
