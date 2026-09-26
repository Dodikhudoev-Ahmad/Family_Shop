import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import './CategoryStrip.css';

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// Line icons keyed by category slug; unknown slugs fall back to a tag icon.
const ICONS: Record<string, ReactNode> = {
  women: svg(<path d="M12 6a2 2 0 1 0-2-2M12 6v2l8 6H4l8-6M4 14v0M4 14h16" />),
  men: svg(<path d="M8 4l-4 3 2 3 2-1v11h8V9l2 1 2-3-4-3-2 2h-4z" />),
  kids: svg(<path d="M9 4l-5 3 2 3 2-1v4h8V9l2 1 2-3-5-3a3 3 0 0 1-6 0zM8 14v6h8v-6" />),
  'shoes-bags': svg(<path d="M5 9h14l-1 11H6zM9 9V7a3 3 0 0 1 6 0v2" />),
  'bytovaya-tehnika': svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="14" r="3.5" /><path d="M8 7h.01M11 7h5" /></>),
  sport: svg(<path d="M2 12h3M19 12h3M5 8v8M8 6v12M16 6v12M19 8v8M8 12h8" />),
  posuda: svg(<path d="M4 10h16a8 8 0 0 1-16 0zM8 20h8M9 3c0 2 2 2 2 4M14 3c0 2 2 2 2 4" />),
  aksessuary: svg(<><circle cx="12" cy="14" r="6" /><path d="M12 11v3l2 1M9.5 4.5h5l.5 3.5h-6z" /></>),
};

const FALLBACK = svg(<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>);

/** Mobile-only horizontal strip with every store category, shown right under the header. */
export function CategoryStrip() {
  const { categories } = useCategories();
  if (categories.length === 0) return null;

  return (
    <nav className="category-strip" aria-label="Категории">
      <ul className="category-strip__list">
        {categories.map((c) => (
          <li key={c.id}>
            <NavLink to={`/catalog/${c.slug}`} className="category-strip__item">
              <span className="category-strip__icon">{ICONS[c.slug] ?? FALLBACK}</span>
              <span className="category-strip__label">{c.name}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
