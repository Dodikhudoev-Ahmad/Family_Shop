import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useNoindexSeo, type NoindexTitleKey } from '../hooks/useNoindexSeo';
import { NotFoundPage } from './NotFoundPage';

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

function Closed({ titleKey }: { titleKey: NoindexTitleKey }) {
  useNoindexSeo(titleKey);
  return null;
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
});

describe('closed pages are noindex with their own titles', () => {
  it.each([
    ['cartTitle', 'Корзина — Family Shop'],
    ['checkoutTitle', 'Оформление заказа — Family Shop'],
    ['accountTitle', 'Личный кабинет — Family Shop'],
    ['loginTitle', 'Вход — Family Shop'],
    ['favoritesTitle', 'Избранное — Family Shop'],
    ['adminTitle', 'Админка — Family Shop'],
    ['notFoundTitle', 'Страница не найдена — Family Shop'],
  ] as const)('%s', (key, title) => {
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <Closed titleKey={key} />
      </MemoryRouter>,
    );
    expect(document.title).toBe(title);
    expect(robots()).toBe('noindex,nofollow');
  });
});

describe('unknown address', () => {
  it('shows the 404 page and is noindex', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/no/such/page']}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(getByText('404')).toBeInTheDocument();
    expect(robots()).toBe('noindex,nofollow');
    expect(document.title).toBe('Страница не найдена — Family Shop');
  });
});
