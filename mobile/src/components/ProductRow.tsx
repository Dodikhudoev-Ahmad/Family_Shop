import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Product } from '../lib/types';
import { fontSizes, fonts, MIN_TOUCH_TARGET, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './Skeleton';

const styles = (c: ColorTokens) => ({
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingLeft: spacing.md },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl, flexShrink: 1 },
  all: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const, paddingHorizontal: spacing.md },
  allText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
});

/** Card width for a horizontal row: a little over two cards fit, so the next one peeks in and invites a swipe. */
export function rowCardWidth(windowWidth: number): number {
  return Math.min(190, Math.floor((windowWidth - spacing.md * 2 - spacing.sm) / 2.1));
}

interface ProductRowProps {
  title: string;
  products: Product[];
  loading?: boolean;
  onOpen: (product: Product) => void;
  onSeeAll?: () => void;
}

/** A titled horizontal strip of ProductCards (home sections, related products). */
export function ProductRow({ title, products, loading = false, onOpen, onSeeAll }: ProductRowProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const cardWidth = rowCardWidth(width);

  if (!loading && products.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">
          {title}
        </Text>
        {onSeeAll && !loading ? (
          <Pressable accessibilityRole="link" onPress={onSeeAll} style={s.all}>
            <Text style={s.allText}>{t('mobile.seeAll')}</Text>
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }}>
          <ProductCardSkeleton width={cardWidth} />
          <ProductCardSkeleton width={cardWidth} />
          <ProductCardSkeleton width={cardWidth} />
        </View>
      ) : (
        <FlatList
          horizontal
          data={products}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} onPress={() => onOpen(item)} />}
        />
      )}
    </View>
  );
}
