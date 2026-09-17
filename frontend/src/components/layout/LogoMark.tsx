// Shared hanger glyph used next to the "Family Shop" wordmark in the Header
// and AdminLayout, and as the source for public/favicon.svg (kept in sync
// manually since a favicon file can't import this component or currentColor).
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5a2 2 0 1 1 2 2c-.6.4-1 1-1 1.7V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M12 8 3 14.5c-.8.6-.3 1.9.7 1.9h16.6c1 0 1.5-1.3.7-1.9L12 8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M5 17.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
