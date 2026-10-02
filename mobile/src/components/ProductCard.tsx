import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isLowStock, isOutOfStock } from '../lib/catalog/stock';
import { discountPercent, formatPrice } from '../lib/mappers';
import type { Product } from '../lib/types';
import { useCategories } from '../state/CategoriesContext';
import { useFavorites } from '../state/FavoritesContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { StarRating } from './StarRating';

const styles = (c: ColorTokens) => ({
  card: { gap: spacing.sm },
  imageWrap: { aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden' as const, backgroundColor: c.bgSecondary },
  imageOut: { opacity: 0.5 },
  image: { width: '100%' as const, height: '100%' as const },
  badges: { position: 'absolute' as const, top: spacing.sm, left: spacing.sm, right: MIN_TOUCH_TARGET, gap: 4, alignItems: 'flex-start' as const },
  badge: { backgroundColor: c.accent, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeHit: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.accent },
  badgeOut: { backgroundColor: c.text },
  badgeText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  badgeHitText: { color: c.accent },
  badgeOutText: { color: c.bg },
  // The visible circle is 34pt; the pressable around it is the full 44pt target.
  favHit: { position: 'absolute' as const, top: 0, right: 0, width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  favCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.bg, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: 0.94 },
  info: { gap: 3 },
  gender: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  name: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, lineHeight: 18 },
  priceRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'baseline' as const, columnGap: spacing.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  priceNew: { color: c.accent },
  priceOld: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs, textDecorationLine: 'line-through' as const },
  stock: { color: c.warning, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs },
});

/** Width of one card in the two-column grid (16pt side margins, 8pt gap) - the same everywhere products are listed. */
export function useGridCardWidth(): number {
  const { width } = useWindowDimensions();
  return Math.floor((width - spacing.md * 2 - spacing.sm) / 2);
}

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  /** Fixed width - grids and horizontal rows size their cards; omitted, the card fills its parent. */
  width?: number;
}

/** The one product card for every list: home sections, catalogue grid, related, favourites. */
export function ProductCard({ product, onPress, width }: ProductCardProps) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categories } = useCategories();
  const { isFavorite, toggleFavorite } = useFavorites();

  const favorite = isFavorite(product.id);
  const percent = discountPercent(product.price, product.discountPrice);
  const outOfStock = isOutOfStock(product.stock);
  // Gender only means something for apparel-style categories - not on a microwave or a dumbbell.
  const showGender = categories.find((c) => c.id === product.categoryId)?.hasSizes ?? false;
  const genderLabel = t(`gender.${product.gender}`);

  return (
    <View style={[s.card, width !== undefined && { width }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={s.card}>
        <View style={s.imageWrap}>
          {product.images[0] ? (
            <Image source={{ uri: product.images[0] }} style={[s.image, outOfStock && s.imageOut]} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : null}
          {outOfStock || percent !== null || product.isBestseller ? (
            <View style={s.badges}>
              {outOfStock ? (
                <View style={[s.badge, s.badgeOut]}>
                  <Text style={[s.badgeText, s.badgeOutText]}>{t('common.outOfStock')}</Text>
                </View>
              ) : (
                <>
                  {percent !== null ? (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>−{percent}%</Text>
                    </View>
                  ) : null}
                  {product.isBestseller ? (
                    <View style={[s.badge, s.badgeHit]}>
                      <Text style={[s.badgeText, s.badgeHitText]}>{t('card.hit')}</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>
        <View style={s.info}>
          {showGender ? <Text style={s.gender}>{genderLabel}</Text> : null}
          <Text style={s.name} numberOfLines={2}>
            {product.name}
          </Text>
          {product.reviewCount > 0 ? <StarRating value={product.averageRating} count={product.reviewCount} /> : null}
          <View style={s.priceRow}>
            <Text style={[s.price, product.discountPrice !== undefined && s.priceNew]}>{formatPrice(product.discountPrice ?? product.price)}</Text>
            {product.discountPrice !== undefined ? <Text style={s.priceOld}>{formatPrice(product.price)}</Text> : null}
          </View>
          {isLowStock(product.stock) ? <Text style={s.stock}>{t('common.left', { count: product.stock })}</Text> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}
        accessibilityState={{ selected: favorite }}
        onPress={() => toggleFavorite(product.id)}
        style={s.favHit}
      >
        <View style={s.favCircle}>
          <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={18} color={favorite ? colors.accent : colors.text} />
        </View>
      </Pressable>
    </View>
  );
}
