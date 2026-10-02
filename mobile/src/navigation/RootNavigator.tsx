import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigation, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CartScreen } from '../screens/CartScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductScreen } from '../screens/ProductScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { badgeText } from '../lib/favorites';
import { useCart } from '../state/CartContext';
import { useFavorites } from '../state/FavoritesContext';
import { useTheme } from '../theme/ThemeContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET } from '../theme/tokens';
import type {
  CartStackParamList,
  CatalogStackParamList,
  FavoritesStackParamList,
  HomeStackParamList,
  ProfileStackParamList,
  RootTabParamList,
} from './types';

const Tabs = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const CartStack = createNativeStackNavigator<CartStackParamList>();
const FavoritesStack = createNativeStackNavigator<FavoritesStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

/** The default header back arrow is 30pt on web; this one is a full 44pt touch target. */
function HeaderBack() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={() => navigation.goBack()}
      style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="chevron-back" size={24} color={colors.text} />
    </Pressable>
  );
}

function useStackOptions(): NativeStackNavigationOptions {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerTitleStyle: { fontFamily: fonts.heading, fontSize: fontSizes.lg },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBack /> : null),
    contentStyle: { backgroundColor: colors.bg },
  };
}

function HomeNavigator() {
  const { t } = useTranslation();
  const options = useStackOptions();
  return (
    <HomeStack.Navigator screenOptions={options}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="About" component={AboutScreen} options={{ title: t('header.about') }} />
      <HomeStack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Catalog" component={CatalogScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
    </HomeStack.Navigator>
  );
}

function CatalogNavigator() {
  const { t } = useTranslation();
  const options = useStackOptions();
  return (
    <CatalogStack.Navigator screenOptions={options}>
      <CatalogStack.Screen name="About" component={AboutScreen} options={{ title: t('header.about') }} />
      <CatalogStack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
      <CatalogStack.Screen name="Catalog" component={CatalogScreen} options={{ headerShown: false }} />
      <CatalogStack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
    </CatalogStack.Navigator>
  );
}

function CartNavigator() {
  const { t } = useTranslation();
  const options = useStackOptions();
  return (
    <CartStack.Navigator screenOptions={options}>
      <CartStack.Screen name="Cart" component={CartScreen} options={{ title: t('cart.title') }} />
      <CartStack.Screen name="Checkout" component={CheckoutScreen} options={{ title: t('cart.checkout') }} />
      <CartStack.Screen name="Auth" component={AuthScreen} options={{ title: t('auth.tabLogin') }} />
      <CartStack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
    </CartStack.Navigator>
  );
}

function FavoritesNavigator() {
  const { t } = useTranslation();
  const options = useStackOptions();
  return (
    <FavoritesStack.Navigator screenOptions={options}>
      <FavoritesStack.Screen name="Favorites" component={FavoritesScreen} options={{ title: t('favorites.title') }} />
      <FavoritesStack.Screen name="Product" component={ProductScreen} options={{ title: '' }} />
    </FavoritesStack.Navigator>
  );
}

function ProfileNavigator() {
  const { t } = useTranslation();
  const options = useStackOptions();
  return (
    <ProfileStack.Navigator screenOptions={options}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
      <ProfileStack.Screen name="Devices" component={DevicesScreen} options={{ title: t('mobile.devices') }} />
      <ProfileStack.Screen name="Orders" component={OrdersScreen} options={{ title: t('account.myOrders') }} />
      <ProfileStack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={({ route }) => ({ title: t('orders.title', { id: route.params.orderId }) })}
      />
    </ProfileStack.Navigator>
  );
}

export function RootNavigator() {
  const { t } = useTranslation();
  const { colors, theme } = useTheme();
  const { totalItems } = useCart();
  const { favoriteIds } = useFavorites();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Five tabs on a 320pt screen: the longest label ("Избранное") needs the smaller size. Kazakh uses the short "Таңдаулы".
  const labelSize = width < 340 ? 9 : width < 360 ? 10 : fontSizes.xs;

  const navigationTheme = useMemo<Theme>(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: colors.accent, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border },
    };
  }, [colors, theme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          // Explicit height: the default 49pt clips the labels on web and on large-text devices.
          tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6) },
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: labelSize, lineHeight: labelSize + 3 },
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.white, fontFamily: fonts.bodySemibold },
        }}
      >
        <Tabs.Screen
          name="HomeTab"
          component={HomeNavigator}
          options={{ title: t('mobile.tabHome'), tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={22} /> }}
        />
        <Tabs.Screen
          name="CatalogTab"
          component={CatalogNavigator}
          options={{ title: t('nav.catalog'), tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={22} /> }}
        />
        <Tabs.Screen
          name="CartTab"
          component={CartNavigator}
          options={{
            title: t('nav.cart'),
            tabBarBadge: badgeText(totalItems) ?? undefined,
            tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="FavoritesTab"
          component={FavoritesNavigator}
          options={{ title: t('mobile.tabFavorites'), tabBarBadge: badgeText(favoriteIds.length) ?? undefined, tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={22} /> }}
        />
        <Tabs.Screen
          name="ProfileTab"
          component={ProfileNavigator}
          options={{ title: t('nav.profile'), tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={22} /> }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
