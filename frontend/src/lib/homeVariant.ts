import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export type HomeVariant = 'a' | 'b';

export const DEFAULT_HOME_VARIANT: HomeVariant = 'a';
export const VARIANT_PARAM = 'variant';
const STORAGE_KEY = 'family-shop:home-variant';

const isVariant = (value: string | null | undefined): value is HomeVariant => value === 'a' || value === 'b';

function readStored(): HomeVariant | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return isVariant(raw) ? raw : null;
  } catch {
    return null;
  }
}

function store(variant: HomeVariant) {
  try {
    sessionStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // storage unavailable (private mode, blocked data): the flag then lives for this page only
  }
}

/**
 * The look of the header and home page: `?variant=a|b` wins (anything else in the parameter means the
 * default), otherwise the value remembered for this tab, otherwise `a`.
 */
export function resolveHomeVariant(search: string, stored: HomeVariant | null = readStored()): HomeVariant {
  const param = new URLSearchParams(search).get(VARIANT_PARAM);
  if (param === null) return stored ?? DEFAULT_HOME_VARIANT;
  return isVariant(param) ? param : DEFAULT_HOME_VARIANT;
}

/** Publishes the variant as `data-variant` on <html> (all colour comes from the tokens) and remembers it. */
export function useHomeVariant(): HomeVariant {
  const { search } = useLocation();
  const variant = resolveHomeVariant(search);

  useLayoutEffect(() => {
    document.documentElement.dataset.variant = variant;
    store(variant);
  }, [variant]);

  return variant;
}
