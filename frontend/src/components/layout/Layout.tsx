import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { QuickViewModal } from '../QuickView/QuickViewModal';
import { BackToTop } from '../BackToTop/BackToTop';
import { CategoryStrip } from '../CategoryStrip/CategoryStrip';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';

// Pages where switching category should stay one tap away on mobile (no burger menu).
const STRIP_PATHS = /^\/($|catalog|product\/)/;

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <Header />
      {STRIP_PATHS.test(pathname) && <CategoryStrip />}
      <main>
        <Outlet />
      </main>
      <Footer />
      <QuickViewModal />
      <BackToTop />
      <MobileTabBar />
    </div>
  );
}
