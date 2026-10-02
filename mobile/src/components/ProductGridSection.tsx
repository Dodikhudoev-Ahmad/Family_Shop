import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Product } from '../lib/types';
import { fontSizes, fonts, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { ProductCard, useGridCardWidth } from './ProductCard';
import { ProductCardSkeleton } from './Skeleton';
import { Button } from './ui';

/** How many products a home / related section shows before "See all". */
export const SECTION_SIZE = 6;

const styles = (c: ColorTokens) => ({
  wrap: { gap: spacing.md, paddingHorizontal: spacing.md },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: spacing.sm, rowGap: spacing.md },
});

interface ProductGridSectionProps {
  title: string;
  products: Product[];
  loading?: boolean;
  onOpen: (product: Product) => void;
  /** "See all" under the grid; omitted for sections that have nowhere bigger to go. */
  onSeeAll?: () => void;
  size?: number;
}

/**
 * A titled block of products laid out as a vertical two-column grid, like the website on a phone - never a horizontal
 * carousel: the page scrolls down, and a button at the bottom opens the full list.
 */
export function ProductGridSection({ title, products, loading = false, onOpen, onSeeAll, size = SECTION_SIZE }: ProductGridSectionProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const cardWidth = useGridCardWidth();

  if (!loading && products.length === 0) return null;
  const shown = products.slice(0, size);

  return (
    <View style={s.wrap}>
      <Text style={s.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={s.grid}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} width={cardWidth} />)
          : shown.map((product) => <ProductCard key={product.id} product={product} width={cardWidth} onPress={() => onOpen(product)} />)}
      </View>
      {onSeeAll && !loading ? <Button variant="secondary" label={t('mobile.seeAll')} accessibilityLabel={`${title}: ${t('mobile.seeAll')}`} onPress={onSeeAll} /> : null}
    </View>
  );
}
