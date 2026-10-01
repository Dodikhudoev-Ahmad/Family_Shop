import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { restoreLanguage } from './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/state/AuthContext';
import { CartProvider } from './src/state/CartContext';
import { CategoriesProvider } from './src/state/CategoriesContext';
import { FavoritesProvider } from './src/state/FavoritesContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold, Fraunces_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    void restoreLanguage().finally(() => setLanguageReady(true));
  }, []);

  // A failed font load falls back to the system fonts rather than blocking the app.
  if (!(fontsLoaded || fontError) || !languageReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <CategoriesProvider>
            <CartProvider>
              <FavoritesProvider>
                <ThemedStatusBar />
                <RootNavigator />
              </FavoritesProvider>
            </CartProvider>
          </CategoriesProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
