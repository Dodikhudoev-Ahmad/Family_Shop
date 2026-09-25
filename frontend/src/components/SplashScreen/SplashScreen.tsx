import { useState } from 'react';
import './SplashScreen.css';

const SEEN_KEY = 'fs-splash-seen';

function shouldShow(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

// Plays once per browser session. Rendered as an overlay above the app, so
// page content and data fetching proceed in parallel underneath.
export function SplashScreen() {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;

  return (
    <div
      className="splash"
      role="presentation"
      onClick={() => setVisible(false)}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setVisible(false);
      }}
    >
      <div className="splash__word" aria-label="Family Shop">
        <span aria-hidden="true">F</span>
        <span className="splash__rest splash__rest--family" aria-hidden="true">amily</span>
        <span className="splash__gap" aria-hidden="true" />
        <span aria-hidden="true">S</span>
        <span className="splash__rest splash__rest--shop" aria-hidden="true">hop</span>
      </div>
    </div>
  );
}
