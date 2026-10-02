import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { ProductGridSection } from '../components/ProductGridSection';
import { PromoBanner } from '../components/PromoBanner';
import { Scrim } from '../components/Scrim';
import { SkeletonBlock } from '../components/Skeleton';
import { Screen, StateMessage } from '../components/ui';
import { HERO_SLUGS } from '../categoryCovers';
import { useSmartHeader } from '../hooks/useSmartHeader';
import { useLabels } from '../i18n/labels';
import { categoryCover, homeSections, resolveInternalPath } from '../lib/catalog/homeSections';
import type { Category } from '../lib/types';
import type { HomeStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl, paddingHorizontal: spacing.md },
  // The website's hero tiles: 16:10 photo, dark gradient at the bottom, title + "View ->".
  hero: { marginHorizontal: spacing.md, aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: 'hidden' as const, backgroundColor: c.bgSecondary, justifyContent: 'flex-end' as const },
  heroContent: { padding: spacing.md, gap: spacing.xs },
  heroTitle: { color: '#FFFFFF', fontFamily: fonts.heading, fontSize: fontSizes.xxl },
  heroCta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  heroCtaText: { color: '#FFFFFF', fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, paddingHorizontal: spacing.md },
  tile: { aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden' as const, backgroundColor: c.bgSecondary, justifyContent: 'flex-end' as const },
  tileName: { color: '#FFFFFF', fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, padding: spacing.sm },
  tileNameNoImage: { color: c.text },
});

/** Home, laid out like the website on a phone: header, the three hero tiles, banner, other categories, product blocks. */
export function HomeScreen({ navigation }: NativeStackScreenProps<HomeStackParamList, 'Home'>) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { width } = useWindowDimensions();
  const smart = useSmartHeader();
  const { categories, isLoading: categoriesLoading, error: categoriesError, reload: reloadCategories } = useCategories();
  const { products, isLoading: productsLoading, error: productsError, reload: reloadProducts } = useProducts();
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => homeSections(products), [products]);
  const heroes = HERO_SLUGS.map((slug) => categories.find((c) => c.slug === slug)).filter((c): c is Category => c !== undefined);
  const others = categories.filter((c) => !(HERO_SLUGS as readonly string[]).includes(c.slug));
  const tileWidth = (width - spacing.md * 2 - spacing.sm) / 2;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([reloadCategories(), reloadProducts()]);
    } finally {
      setRefreshing(false);
    }
  };
  const retry = () => {
    void reloadCategories();
    void reloadProducts();
  };

  const openCategory = (category: Category) => navigation.navigate('Catalog', { categoryId: Number(category.id) });
  const openProduct = (productId: string) => navigation.navigate('Product', { productId: Number(productId) });
  const openLink = (path: string) => {
    const link = resolveInternalPath(path, categories);
    if (link?.screen === 'Product') navigation.navigate('Product', { productId: link.productId });
    else if (link?.screen === 'Catalog') navigation.navigate('Catalog', { categoryId: link.categoryId, discount: link.discount });
  };

  const failed = !categoriesLoading && !productsLoading && categories.length === 0 && (categoriesError || productsError);

  const hero = (category: Category) => {
    const name = categoryName(category);
    const cover = categoryCover(products, category);
    return (
      <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={name} onPress={() => openCategory(category)} style={s.hero}>
        {cover ? <ImageBackground source={{ uri: cover }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
        <Scrim heightPercent={75} maxAlpha={0.6} />
        <View style={s.heroContent}>
          <Text style={s.heroTitle}>{name}</Text>
          <View style={s.heroCta}>
            <Text style={s.heroCtaText}>{t('home.view')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </View>
        </View>
      </Pressable>
    );
  };

  const tile = (category: Category) => {
    const name = categoryName(category);
    const cover = categoryCover(products, category);
    return (
      <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={name} onPress={() => openCategory(category)} style={[s.tile, { width: tileWidth }]}>
        {cover ? <ImageBackground source={{ uri: cover }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
        {cover ? <Scrim heightPercent={65} maxAlpha={0.55} /> : null}
        <Text style={[s.tileName, !cover && s.tileNameNoImage]} numberOfLines={2}>
          {name}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: smart.height + spacing.sm }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={smart.onScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} progressViewOffset={smart.height} />}
      >
        {failed ? (
          <StateMessage message={t('mobile.homeError')} actionLabel={t('mobile.retry')} onAction={retry} />
        ) : (
          <>
            {categoriesLoading ? (
              <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
                <SkeletonBlock height={0} style={{ aspectRatio: 16 / 10, height: undefined, borderRadius: radius.lg }} />
                <SkeletonBlock height={0} style={{ aspectRatio: 16 / 10, height: undefined, borderRadius: radius.lg }} />
              </View>
            ) : (
              heroes.map(hero)
            )}

            <PromoBanner onInternalLink={openLink} />

            {others.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={s.sectionTitle} accessibilityRole="header">
                  {t('header.categories')}
                </Text>
                <View style={s.tiles}>{others.map(tile)}</View>
              </View>
            ) : null}

            <ProductGridSection
              title={t('mobile.hits')}
              products={sections.hits}
              loading={productsLoading}
              onOpen={(p) => openProduct(p.id)}
              onSeeAll={() => navigation.navigate('Catalog', { sort: 'popular' })}
            />
            <ProductGridSection
              title={t('mobile.newArrivals')}
              products={sections.newest}
              loading={productsLoading}
              onOpen={(p) => openProduct(p.id)}
              onSeeAll={() => navigation.navigate('Catalog', { sort: 'new' })}
            />
            <ProductGridSection
              title={t('mobile.discounts')}
              products={sections.discounted}
              loading={productsLoading}
              onOpen={(p) => openProduct(p.id)}
              onSeeAll={() => navigation.navigate('Catalog', { discount: true })}
            />
            {productsError && !productsLoading ? <StateMessage message={t('mobile.productsLoadError')} actionLabel={t('mobile.retry')} onAction={retry} /> : null}
          </>
        )}
      </ScrollView>
      <AppHeader smart={smart} />
    </Screen>
  );
}
