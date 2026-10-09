import { useEffect } from 'react';
import { serializeJsonLd, type JsonLdObject } from '../utils/jsonLd';

const ATTR = 'data-jsonld';

/**
 * Puts the given structured-data objects into <head> as <script type="application/ld+json"> and removes them when the page
 * unmounts or the data changes (unlike meta tags, a stale Product block of the previous page must not stay).
 * The text is set with `textContent` (never parsed as HTML) and also escaped by `serializeJsonLd`.
 * `null` entries are skipped, so a page can pass its data before it has loaded. Pass a memoised array or a string `key`
 * that changes with the content: the effect depends on the serialized text, not on object identity.
 */
export function useJsonLd(blocks: (JsonLdObject | null)[]) {
  const texts = blocks.filter((b): b is JsonLdObject => b !== null).map(serializeJsonLd);
  const joined = texts.join('\n');

  useEffect(() => {
    const scripts = (joined ? joined.split('\n') : []).map((text) => {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute(ATTR, '');
      el.textContent = text;
      document.head.appendChild(el);
      return el;
    });
    return () => scripts.forEach((el) => el.remove());
  }, [joined]);
}
