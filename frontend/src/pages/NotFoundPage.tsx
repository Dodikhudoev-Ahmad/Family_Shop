import { Link } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import './NotFoundPage.css';
import { useTranslation } from 'react-i18next';
import { useNoindexSeo } from '../hooks/useNoindexSeo';

export function NotFoundPage() {
  const { t } = useTranslation();
  useNoindexSeo('notFoundTitle');
  return (
    <div className="container not-found">
      <span className="not-found__code">404</span>
      <h1 className="not-found__title">{t('errors.notFoundTitle')}</h1>
      <p className="not-found__text">
        {t('errors.notFoundText')}
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">
          {t('common.toHome')}
        </Button>
      </Link>
    </div>
  );
}
