import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { QuickViewModal } from '../QuickView/QuickViewModal';
import { BackToTop } from '../BackToTop/BackToTop';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';

export function Layout() {
  return (
    <div className="app-shell">
      <Header />
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
