import { Image, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { discountPercent, formatPrice } from '../lib/mappers';
import type { Product } from '../lib/types';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  card: { marginBottom: spacing.lg },
  imageWrap: { aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden' as const, backgroundColor: c.bgSecondary },
  image: { width: '100%' as const, height: '100%' as const },
  badges: { position: 'absolute' as const, top: spacing.sm, left: spacing.sm, gap: 4, alignItems: 'flex-start' as const },
  badge: { backgroundColor: c.accent, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeHit: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.accent },
  badgeText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  badgeHitText: { color: c.accent },
  info: { paddingTop: spacing.sm, gap: 4 },
  name: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  priceRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: spacing.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.lg },
  priceNew: { color: c.accent },
  priceOld: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm, textDecorationLine: 'line-through' as const },
});

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const percent = discountPercent(product.price, product.discountPrice);
  const outOfStock = product.stock <= 0;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={s.card}>
      <View style={s.imageWrap}>
        {product.images[0] ? <Image source={{ uri: product.images[0] }} style={s.image} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
        <View style={s.badges}>
          {outOfStock ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{t('common.outOfStock')}</Text>
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
      </View>
      <View style={s.info}>
        <Text style={s.name} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={s.priceRow}>
          <Text style={[s.price, product.discountPrice !== undefined && s.priceNew]}>{formatPrice(product.discountPrice ?? product.price)}</Text>
          {product.discountPrice !== undefined ? <Text style={s.priceOld}>{formatPrice(product.price)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}
