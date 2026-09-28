// Real shop contacts come from build-time env vars so no made-up placeholder ever reaches
// customers (a fake phone/email/address or a dead "#" social link reads as a scam). Anything
// left unset is simply not rendered. Set these in the deploy environment:
//   VITE_CONTACT_PHONE, VITE_CONTACT_EMAIL, VITE_CONTACT_ADDRESS,
//   VITE_SOCIAL_INSTAGRAM, VITE_SOCIAL_TELEGRAM, VITE_SOCIAL_VK, VITE_SOCIAL_WHATSAPP
//   (full https:// URLs; VITE_CONTACT_PHONE is the display string, e.g. "+7 708 167 98 58")
const env = import.meta.env;

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeUrl(value: unknown): string | undefined {
  const url = clean(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export const CONTACT_PHONE = clean(env.VITE_CONTACT_PHONE);
export const CONTACT_EMAIL = clean(env.VITE_CONTACT_EMAIL);
export const CONTACT_ADDRESS = clean(env.VITE_CONTACT_ADDRESS);

/** "+7 708 167 98 58" -> "tel:+77081679858" - keeps the leading "+", drops everything else
 * that isn't a digit (spaces, brackets, dashes) so the display string can stay human-readable. */
export const CONTACT_PHONE_HREF = CONTACT_PHONE ? `tel:${CONTACT_PHONE.replace(/(?!^\+)[^\d]/g, '')}` : undefined;

export const CONTACT_WHATSAPP = safeUrl(env.VITE_SOCIAL_WHATSAPP);
export const CONTACT_TELEGRAM = safeUrl(env.VITE_SOCIAL_TELEGRAM);

export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: 'Instagram', href: safeUrl(env.VITE_SOCIAL_INSTAGRAM) },
  { label: 'VK', href: safeUrl(env.VITE_SOCIAL_VK) },
].filter((s): s is { label: string; href: string } => Boolean(s.href));
