import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import { Screen, StateMessage } from '../components/ui';
import { favoritesView } from '../lib/favorites';
import { useFavorites } from '../state/FavoritesContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  notice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: c.accentSoft },
  noticeText: { flex: 1, color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  noticeBtn: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: spacing.sm },
  noticeBtnText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
});

/**
 * Favourites. Like on the website they are kept on the device (a list of product ids) and shown from the live
 * catalogue: sold-out products stay (marked "out of stock"), products deleted from the shop are reported and can be removed.
 */
export function FavoritesScreen() {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - spacing.md * 2 - spacing.sm) / 2);
  const { favoriteIds, removeMany } = useFavorites();
  const { products, isLoading, error, reload } = useProducts();

  const view = useMemo(() => favoritesView(favoriteIds, products), [favoriteIds, products]);
  // Until the catalogue is known nothing can be called "missing".
  const catalogueKnown = !isLoading && products.length > 0;
  const missing = catalogueKnown ? view.missingIds : [];

  const header =
    missing.length > 0 ? (
      <View style={s.notice} accessibilityRole="alert">
        <Text style={s.noticeText}>{t('mobile.favoritesMissing', { count: missing.length })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.removeUnavailable')} onPress={() => removeMany(missing)} style={s.noticeBtn}>
          <Text style={s.noticeBtnText}>{t('mobile.removeUnavailable')}</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <Screen>
      <FlatList
        data={catalogueKnown ? view.products : []}
        keyExtractor={(product) => product.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshing={isLoading && products.length > 0}
        onRefresh={() => void reload()}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} onPress={() => navigation.navigate('Product', { productId: Number(item.id) })} />}
        ListEmptyComponent={
          favoriteIds.length === 0 ? (
            <StateMessage message={t('favorites.empty')} actionLabel={t('common.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
          ) : isLoading ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <ProductCardSkeleton width={cardWidth} />
              <ProductCardSkeleton width={cardWidth} />
            </View>
          ) : error && products.length === 0 ? (
            <StateMessage message={t('mobile.productsLoadError')} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
          ) : null
        }
      />
    </Screen>
  );
}
