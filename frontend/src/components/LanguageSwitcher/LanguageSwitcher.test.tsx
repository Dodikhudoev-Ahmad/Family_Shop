import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '../../i18n';
import { useLabels } from '../../i18n/labels';

function Probe() {
  const { t } = useTranslation();
  const { categoryName, productType } = useLabels();
  return (
    <div>
      <span data-testid="cart">{t('nav.cart')}</span>
      <span data-testid="cat">{categoryName({ slug: 'women', name: 'Женское' })}</span>
      <span data-testid="unknown-cat">{categoryName({ slug: 'new-one', name: 'Новая категория' })}</span>
      <span data-testid="type">{productType('Кроссовки')}</span>
      <span data-testid="unknown-type">{productType('Редкий тип')}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  setLanguage('ru');
  localStorage.clear();
});

describe('LanguageSwitcher (menu)', () => {
  it('lists RU / KZ / EN, applies the pick immediately and closes', () => {
    render(
      <>
        <LanguageSwitcher />
        <Probe />
      </>
    );
    expect(screen.getByTestId('cart')).toHaveTextContent('Корзина');

    fireEvent.click(screen.getByRole('button', { name: 'Язык' }));
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['RUРусский', 'KZҚазақша', 'ENEnglish']);
    expect(screen.getByRole('menuitemradio', { name: /Русский/ })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Қазақша/ }));
    expect(screen.getByTestId('cart')).toHaveTextContent('Себет');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Тіл' })).toHaveTextContent('KZ');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('kk');

    fireEvent.click(screen.getByRole('button', { name: 'Тіл' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /English/ }));
    expect(screen.getByTestId('cart')).toHaveTextContent('Cart');
  });

  it('closes on Escape', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Язык' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('LanguageSwitcher (inline, burger menu)', () => {
  it('shows all three and marks the active one', () => {
    render(
      <>
        <LanguageSwitcher variant="inline" />
        <Probe />
      </>
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('cart')).toHaveTextContent('Cart');
  });
});

describe('category and product-type names from the database', () => {
  it('translates known ones and shows unknown ones exactly as stored', () => {
    render(<Probe />);
    expect(screen.getByTestId('cat')).toHaveTextContent('Женское');
    setLanguage('kk');
    cleanup();
    render(<Probe />);
    expect(screen.getByTestId('cat')).toHaveTextContent('Әйелдерге');
    expect(screen.getByTestId('type')).toHaveTextContent('Кроссовкалар');
    expect(screen.getByTestId('unknown-cat')).toHaveTextContent('Новая категория');
    expect(screen.getByTestId('unknown-type')).toHaveTextContent('Редкий тип');
  });
});
