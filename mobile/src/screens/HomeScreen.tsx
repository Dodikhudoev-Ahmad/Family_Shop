import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PromoBanner } from '../components/PromoBanner';
import { ProductRow } from '../components/ProductRow';
import { SkeletonBlock } from '../components/Skeleton';
import { Logo, Screen, StateMessage } from '../components/ui';
import { categoryCover, homeSections, resolveInternalPath } from '../lib/catalog/homeSections';
import { useLabels } from '../i18n/labels';
import type { Category } from '../lib/types';
import type { HomeStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const TILE_HEIGHT = 112;

const styles = (c: ColorTokens) => ({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  top: { paddingHorizontal: spacing.md, gap: spacing.md },
  search: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
    paddingHorizontal: spacing.md,
    color: c.text,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
  },
  sectionTitle: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl, paddingHorizontal: spacing.md },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, paddingHorizontal: spacing.md },
  tile: { height: TILE_HEIGHT, borderRadius: radius.md, overflow: 'hidden' as const, backgroundColor: c.bgSecondary, justifyContent: 'flex-end' as const },
  tileShade: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26, 26, 26, 0.35)' },
  tileName: { color: '#FFFFFF', fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, padding: spacing.sm },
  tileNameNoImage: { color: c.text },
});

/** Home: search, promo banner, category tiles with photos, then Bestsellers / New in / Sale - all from the real API. */
export function HomeScreen({ navigation }: NativeStackScreenProps<HomeStackParamList, 'Home'>) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { categories, isLoading: categoriesLoading, error: categoriesError, reload: reloadCategories } = useCategories();
  const { products, isLoading: productsLoading, error: productsError, reload: reloadProducts } = useProducts();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => homeSections(products), [products]);
  const tileWidth = (width - spacing.md * 2 - spacing.sm) / 2;

  const submitSearch = () => {
    const search = query.trim();
    if (search) navigation.navigate('Catalog', { search });
  };

  const openProduct = (productId: string) => navigation.navigate('Product', { productId: Number(productId) });

  const openLink = (path: string) => {
    const link = resolveInternalPath(path, categories);
    if (link?.screen === 'Product') navigation.navigate('Product', { productId: link.productId });
    else if (link?.screen === 'Catalog') navigation.navigate('Catalog', { categoryId: link.categoryId, discount: link.discount });
  };

  const failed = !categoriesLoading && !productsLoading && categories.length === 0 && (categoriesError || productsError);
  const retry = () => {
    void reloadCategories();
    void reloadProducts();
  };

  const tile = (category: Category) => {
    const name = categoryName(category);
    const cover = categoryCover(products, category.id);
    const open = () => navigation.navigate('Catalog', { categoryId: Number(category.id) });
    return (
      <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={name} onPress={open} style={[s.tile, { width: tileWidth }]}>
        {cover ? (
          <ImageBackground source={{ uri: cover }} style={{ flex: 1, justifyContent: 'flex-end' }} resizeMode="cover" accessibilityIgnoresInvertColors>
            <View style={s.tileShade} />
            <Text style={s.tileName} numberOfLines={2}>
              {name}
            </Text>
          </ImageBackground>
        ) : (
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Text style={[s.tileName, s.tileNameNoImage]} numberOfLines={2}>
              {name}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, spacing.sm) + spacing.sm }]} keyboardShouldPersistTaps="handled">
        <View style={s.top}>
          <Logo />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder={t('header.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('mobile.search')}
            style={s.search}
            autoCorrect={false}
          />
        </View>

        {failed ? (
          <StateMessage message={t('mobile.homeError')} actionLabel={t('mobile.retry')} onAction={retry} />
        ) : (
          <>
            <PromoBanner onInternalLink={openLink} />

            <View style={{ gap: spacing.sm }}>
              <Text style={s.sectionTitle} accessibilityRole="header">
                {t('header.categories')}
              </Text>
              <View style={s.tiles}>
                {categoriesLoading
                  ? [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} width={tileWidth} height={TILE_HEIGHT} style={{ borderRadius: radius.md }} />)
                  : categories.map(tile)}
              </View>
            </View>

            <ProductRow
              title={t('mobile.hits')}
              products={sections.hits}
              loading={productsLoading}
              onOpen={(p) => openProduct(p.id)}
            />
            <ProductRow
              title={t('mobile.newArrivals')}
              products={sections.newest}
              loading={productsLoading}
              onOpen={(p) => openProduct(p.id)}
              onSeeAll={() => navigation.navigate('Catalog', undefined)}
            />
            <ProductRow
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
    </Screen>
  );
}
