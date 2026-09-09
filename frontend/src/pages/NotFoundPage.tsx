import { Link } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import './NotFoundPage.css';

export function NotFoundPage() {
  return (
    <div className="container not-found">
      <span className="not-found__code">404</span>
      <h1 className="not-found__title">Страница не найдена</h1>
      <p className="not-found__text">
        Похоже, такой страницы не существует или она была перемещена.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">
          На главную
        </Button>
      </Link>
    </div>
  );
}
