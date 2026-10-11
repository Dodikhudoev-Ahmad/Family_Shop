import { render } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { Trans } from 'react-i18next';
import { describe, it, expect } from 'vitest';
import i18n from '../../i18n';

// <link> is a void HTML element: written as a Trans tag it rendered as an empty anchor followed by the plain text,
// so a guest saw no clickable "log in" in the review section. The tag is <signin> now.
describe('review login prompt', () => {
  it.each(['ru', 'kk', 'en'])('has a clickable link with text in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = render(
      <MemoryRouter>
        <p>
          <Trans i18nKey="reviews.loginPrompt" components={{ signin: <Link to="/login" /> }} />
        </p>
      </MemoryRouter>
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/login');
    expect(link?.textContent?.trim().length).toBeGreaterThan(2);
    await i18n.changeLanguage('ru');
  });
});
