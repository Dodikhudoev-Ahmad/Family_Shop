import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, LANGUAGE_META, isLanguage, setLanguage, type Language } from '../../i18n';
import './LanguageSwitcher.css';

interface LanguageSwitcherProps {
  /** "menu": compact RU ▾ button with a dropdown (header). "inline": all three side by side (burger menu). */
  variant?: 'menu' | 'inline';
}

export function LanguageSwitcher({ variant = 'menu' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const current: Language = isLanguage(i18n.language) ? i18n.language : 'ru';

  if (variant === 'inline') {
    return (
      <div className="lang-inline" role="group" aria-label={t('language.label')}>
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            className={`lang-inline__btn ${lang === current ? 'is-active' : ''}`}
            aria-pressed={lang === current}
            onClick={() => setLanguage(lang)}
            lang={lang}
          >
            {LANGUAGE_META[lang].name}
          </button>
        ))}
      </div>
    );
  }

  return <LanguageMenu current={current} label={t('language.label')} />;
}

function LanguageMenu({ current, label }: { current: Language; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const onPointerDown = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen]);

  return (
    <div className="lang-menu" ref={rootRef}>
      <button
        type="button"
        className="lang-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="lang-menu__code">{LANGUAGE_META[current].code}</span>
        <svg className={`lang-menu__chevron ${isOpen ? 'is-open' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <ul className="lang-menu__list" role="menu" aria-label={label}>
          {LANGUAGES.map((lang) => (
            <li key={lang} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={lang === current}
                className={`lang-menu__item ${lang === current ? 'is-active' : ''}`}
                lang={lang}
                onClick={() => {
                  setLanguage(lang);
                  setIsOpen(false);
                }}
              >
                <span className="lang-menu__item-code">{LANGUAGE_META[lang].code}</span>
                <span className="lang-menu__item-name">{LANGUAGE_META[lang].name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
