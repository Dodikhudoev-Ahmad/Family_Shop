import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from '../Cart/CartDrawer';
import { QuickViewModal } from '../QuickView/QuickViewModal';
import { BackToTop } from '../BackToTop/BackToTop';

export function Layout() {
  return (
    <div className="app-shell">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <QuickViewModal />
      <BackToTop />
    </div>
  );
}
