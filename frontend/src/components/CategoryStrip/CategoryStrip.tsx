import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import './CategoryStrip.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../../i18n/labels';

/** Mobile-only text bar with every store category, shown right under the header. */
export function CategoryStrip() {
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { categories } = useCategories();
  const { pathname } = useLocation();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active category visible when it was reached from outside the strip
  // (deep link, mega menu, product page) - scrolls the strip only, never the page.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('.category-strip__item.active');
    if (!list || !active) return;
    const target = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
  }, [pathname, categories]);

  if (categories.length === 0) return null;

  return (
    <nav className="category-strip" aria-label={t('header.categories')}>
      <ul className="category-strip__list" ref={listRef}>
        {categories.map((c) => (
          <li key={c.id}>
            <NavLink to={`/catalog/${c.slug}`} className="category-strip__item">
              {categoryName(c)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
