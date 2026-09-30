import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { QuickViewModal } from '../QuickView/QuickViewModal';
import { BackToTop } from '../BackToTop/BackToTop';
import { CategoryStrip } from '../CategoryStrip/CategoryStrip';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';
import { HeaderVisibilityProvider, useHeaderVisibility } from '../../context/HeaderVisibilityContext';

// Pages where switching category should stay one tap away on mobile (no burger menu).
const STRIP_PATHS = /^\/($|catalog|product\/)/;

// Header + (on mobile) the category strip right under it slide away together as one sticky
// block on scroll-down, so they never end up half on/off screen independently of each other.
function HeaderStack({ showStrip }: { showStrip: boolean }) {
  const { isHidden } = useHeaderVisibility();
  const ref = useRef<HTMLDivElement>(null);

  // Publishes how much of the top of the screen the stack currently covers (its real height -
  // header, search row and, on some pages, the category strip - or 0 while it is tucked away),
  // so toasts and sticky panels can sit right under it instead of under a hard-coded guess.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--header-stack-h', isHidden ? '0px' : `${el.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isHidden, showStrip]);

  return (
    <div ref={ref} className={`header-stack ${isHidden ? 'header-stack--hidden' : ''}`}>
      <Header />
      {showStrip && <CategoryStrip />}
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  return (
    <HeaderVisibilityProvider>
      <div className="app-shell">
        <HeaderStack showStrip={STRIP_PATHS.test(pathname)} />
        <main>
          <Outlet />
        </main>
        <Footer />
        <QuickViewModal />
        <BackToTop />
        <MobileTabBar />
      </div>
    </HeaderVisibilityProvider>
  );
}
