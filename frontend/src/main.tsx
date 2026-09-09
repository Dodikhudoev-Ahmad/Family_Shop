import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'
import './styles/toast.css'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './context/ToastContext'
import { CategoriesProvider } from './context/CategoriesContext'
import { ProductsProvider } from './context/ProductsContext'
import { CartProvider } from './context/CartContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { AuthProvider } from './context/AuthContext'
import { QuickViewProvider } from './context/QuickViewContext'
import { ThemeProvider } from './context/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <CategoriesProvider>
          <ProductsProvider>
            <AuthProvider>
              <FavoritesProvider>
                <CartProvider>
                  <QuickViewProvider>
                    <App />
                  </QuickViewProvider>
                </CartProvider>
              </FavoritesProvider>
            </AuthProvider>
          </ProductsProvider>
        </CategoriesProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
