import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProductsPage, ApiError } from '../../lib/api';
import type { ProductDto } from '../../types/api';
import { formatPrice } from '../../utils/formatPrice';
import { FadeImage } from '../FadeImage/FadeImage';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import './SearchOverlay.css';
import { useTranslation } from 'react-i18next';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;
const RESULTS_LIMIT = 6;

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductDto[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setQuery('');
    setResults([]);
    setStatus('idle');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus('idle');
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus('loading');

    const t = setTimeout(async () => {
      try {
        const page = await fetchProductsPage({ search: trimmed, pageSize: RESULTS_LIMIT });
        if (requestIdRef.current !== requestId) return;
        setResults(page.items);
        setStatus('done');
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setStatus('error');
        if (!(err instanceof ApiError)) throw err;
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [query]);

  if (!isOpen) return null;

  const trimmed = query.trim();

  return (
    <>
      <div className="search-overlay__backdrop" onClick={onClose} />
      <div className="search-overlay" role="dialog" aria-modal="true" aria-label={t('search.dialog')}>
        <div className="search-overlay__bar">
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            className="search-overlay__input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('search.dialog')}
          />
          <button className="search-overlay__close" onClick={onClose} aria-label={t('search.close')}>
            &times;
          </button>
        </div>

        <div className="search-overlay__body">
          {status === 'loading' && <div className="search-overlay__hint">{t('search.searching')}</div>}

          {status === 'error' && (
            <div className="search-overlay__hint">{t('search.failed')}</div>
          )}

          {status === 'done' && results.length === 0 && (
            <div className="search-overlay__hint">
              <NoResultsIcon />
              <p>{t('search.nothing', { query: trimmed })}</p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="search-overlay__results">
              {results.map((product) => (
                <li key={product.id}>
                  <Link to={`/product/${product.id}`} className="search-result" onClick={onClose}>
                    <div className="search-result__image">
                      <FadeImage src={product.images[0]} alt={product.name} />
                    </div>
                    <div className="search-result__info">
                      <span className="search-result__name">{product.name}</span>
                      <span className="search-result__price">
                        {formatPrice(product.discountPrice ?? product.price)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {status === 'idle' && !trimmed && (
            <div className="search-overlay__hint">{t('search.start')}</div>
          )}
        </div>
      </div>
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M18 18L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NoResultsIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.5 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
