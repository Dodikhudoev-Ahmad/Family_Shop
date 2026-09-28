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
  return (
    <div className={`header-stack ${isHidden ? 'header-stack--hidden' : ''}`}>
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
