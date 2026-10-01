/** A same-site path such as "/catalog/women". "//host" and "/\host" start with a slash too, but a
 * router or browser treats them as another site, so they are not internal. */
export function isInternalPath(link: string | null | undefined): link is string {
  return !!link && link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\');
}

export function isHttpUrl(link: string | null | undefined): link is string {
  return !!link && /^https?:\/\//i.test(link);
}
