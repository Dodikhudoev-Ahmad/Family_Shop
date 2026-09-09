import { Link } from 'react-router-dom';
import './Breadcrumbs.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="breadcrumb">
      <ol className="breadcrumbs__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="breadcrumbs__item">
              {!isLast && item.href ? (
                <Link to={item.href} className="breadcrumbs__link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && <span className="breadcrumbs__separator">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
