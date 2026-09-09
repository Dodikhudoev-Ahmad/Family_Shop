import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from '../Cart/CartDrawer';
import { QuickViewModal } from '../QuickView/QuickViewModal';

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
    </div>
  );
}
