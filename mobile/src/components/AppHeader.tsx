import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SmartHeader } from '../hooks/useSmartHeader';
import { useLabels } from '../i18n/labels';
import type { Category } from '../lib/types';
import { useAuth } from '../state/AuthContext';
import { useCategories } from '../state/CategoriesContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { ConfirmSheet } from './forms';
import { LanguageMenu } from './LanguageMenu';
import { MenuDrawer } from './MenuDrawer';
import { Logo } from './ui';

const styles = (c: ColorTokens) => ({
  stack: { position: 'absolute' as const, top: 0, left: 0, right: 0, zIndex: 20, backgroundColor: c.bg },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 56, paddingHorizontal: spacing.sm },
  iconBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  logo: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, minHeight: MIN_TOUCH_TARGET },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const },
  searchRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  search: {
    minHeight: MIN_TOUCH_TARGET + 4,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
  },
  searchText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md },
  strip: { borderBottomWidth: 1, borderBottomColor: c.border },
  stripContent: { paddingHorizontal: spacing.md, gap: spacing.md },
  stripItem: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const },
  stripText: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, letterSpacing: 0.2 },
  stripTextActive: { color: c.accent },
  underline: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, height: 2, backgroundColor: c.accent },
});

interface AppHeaderProps {
  smart: SmartHeader;
  /** The category being browsed (underlined in the strip), or null on the home screen. */
  activeCategoryId?: string | null;
}

/**
 * The website's mobile header, shared by Home and Catalog: burger, centred logo, language dropdown, theme toggle,
 * the search bar and the category strip. It slides away on scroll down and comes back on scroll up (useSmartHeader).
 */
export function AppHeader({ smart, activeCategoryId = null }: AppHeaderProps) {
  const s = useThemedStyles(styles);
  const { colors, theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { categories } = useCategories();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const stripRef = useRef<ScrollView>(null);
  const itemX = useRef(new Map<string, { x: number; w: number }>());
  const { setOverlayOpen } = smart;

  useEffect(() => setOverlayOpen('burger', menuOpen), [menuOpen, setOverlayOpen]);

  // The active category is kept in view when it was reached from outside the strip (burger, a tile, a deep link).
  useEffect(() => {
    if (!activeCategoryId) return;
    const frame = itemX.current.get(activeCategoryId);
    if (frame) stripRef.current?.scrollTo({ x: Math.max(0, frame.x - spacing.md), animated: false });
  }, [activeCategoryId, categories]);

  const openCategory = (category: Category) => {
    setMenuOpen(false);
    navigation.navigate('Catalog', { categoryId: Number(category.id) });
  };

  return (
    <Animated.View style={[s.stack, { paddingTop: insets.top, transform: [{ translateY: smart.translateY }] }]} onLayout={smart.onLayout}>
      <View style={s.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('header.openMenu')} onPress={() => setMenuOpen(true)} style={s.iconBtn}>
          <BurgerIcon color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={t('header.home')} onPress={() => navigation.navigate('HomeTab', { screen: 'Home' })} style={s.logo}>
          <Logo />
        </Pressable>
        <View style={s.actions}>
          <LanguageMenu onOpenChange={(open) => setOverlayOpen('language', open)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={s.iconBtn}
          >
            <Ionicons name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={s.searchRow}>
        <Pressable accessibilityRole="search" accessibilityLabel={t('header.search')} onPress={() => navigation.navigate('Search')} style={s.search}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <Text style={s.searchText}>{t('header.searchPlaceholder')}</Text>
        </Pressable>
      </View>

      {categories.length > 0 ? (
        <View style={s.strip}>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stripContent} accessibilityLabel={t('header.categories')}>
            {categories.map((category) => {
              const active = category.id === activeCategoryId;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="link"
                  accessibilityLabel={categoryName(category)}
                  accessibilityState={{ selected: active }}
                  onLayout={(e) => itemX.current.set(category.id, { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width })}
                  onPress={() => openCategory(category)}
                  style={s.stripItem}
                >
                  <Text style={[s.stripText, active && s.stripTextActive]}>{categoryName(category)}</Text>
                  {active ? <View style={s.underline} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <MenuDrawer
        visible={menuOpen}
        categories={categories}
        activeCategoryId={activeCategoryId}
        user={user}
        onClose={() => setMenuOpen(false)}
        onCategory={openCategory}
        onAbout={() => {
          setMenuOpen(false);
          navigation.navigate('About');
        }}
        onAccount={() => {
          setMenuOpen(false);
          navigation.navigate('ProfileTab');
        }}
        onRequestLogout={() => {
          setMenuOpen(false);
          setConfirmLogout(true);
        }}
      />

      {confirmLogout ? (
        <ConfirmSheet
          title={t('header.logoutTitle')}
          description={t('header.logoutDescription')}
          confirmLabel={t('header.logoutConfirm')}
          onConfirm={() => {
            setConfirmLogout(false);
            void logout();
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      ) : null}
    </Animated.View>
  );
}

/** The website's thin three-line burger (Ionicons' "menu" is much heavier). */
function BurgerIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, gap: 5 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: 1.6, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}
