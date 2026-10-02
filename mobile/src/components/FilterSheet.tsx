import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  countMatching,
  initialFilters,
  priceBoundsFor,
  selectCategory,
  selectProductType,
  selectSize,
  setPriceRange,
  type CatalogFilters,
} from '../lib/catalog/catalogFilters';
import { availableProductTypes } from '../lib/catalog/productTypes';
import { availableSizeGroups } from '../lib/catalog/sizeGroups';
import type { Category, Product } from '../lib/types';
import { useLabels } from '../i18n/labels';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Chip, ChipGroup } from './Chips';
import { PriceRangeSlider } from './PriceRangeSlider';
import { Button } from './ui';

const styles = (c: ColorTokens) => ({
  group: { gap: spacing.sm },
  // The website's panel titles: small uppercase heading-font labels.
  title: { color: c.textSecondary, fontFamily: fonts.heading, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  subtitle: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs },
  sizeGroup: { gap: spacing.xs },
  sizes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  check: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  boxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkText: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, flexShrink: 1 },
  footer: { flexDirection: 'row' as const, gap: spacing.sm },
});

interface FilterSheetProps {
  filters: CatalogFilters;
  products: Product[];
  categories: Category[];
  /** A text search is active: it has no client-side counterpart, so the exact count is not shown. */
  searching: boolean;
  onApply: (filters: CatalogFilters) => void;
  onClose: () => void;
}

/**
 * Category, type, size, price and "only discounted" in a bottom sheet. Works on a draft that is applied
 * with the button; the dependent filters are reset in the same step as the category (see catalogFilters).
 * Mount it when it opens - the draft starts from the applied filters each time.
 */
export function FilterSheet({ filters, products, categories, searching, onApply, onClose }: FilterSheetProps) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categoryName, productType: typeName } = useLabels();
  const [draft, setDraft] = useState(filters);

  const bounds = priceBoundsFor(products, draft.categoryId);
  const types = availableProductTypes(products, draft.categoryId);
  const sizeGroups = availableSizeGroups(products, draft.categoryId, draft.productType);
  const count = countMatching(products, draft);

  return (
    <BottomSheet
      visible
      title={t('catalog.filters')}
      onClose={onClose}
      footer={
        <View style={s.footer}>
          <Button variant="secondary" label={t('mobile.reset')} onPress={() => setDraft(initialFilters(products, draft.categoryId))} />
          <Button
            style={{ flex: 1 }}
            label={searching ? t('mobile.apply') : t('catalog.show', { count, more: '' })}
            onPress={() => onApply(draft)}
            disabled={!searching && count === 0}
          />
        </View>
      }
    >
      <View style={s.group}>
        <Text style={s.title}>{t('filters.category')}</Text>
        <ChipGroup
          value={draft.categoryId}
          onChange={(id) => setDraft((d) => selectCategory(d, id, products))}
          options={[{ value: null, label: t('common.all') }, ...categories.map((c) => ({ value: c.id, label: categoryName(c) }))]}
        />
      </View>

      {types.length > 1 ? (
        <View style={s.group}>
          <Text style={s.title}>{t('filters.type')}</Text>
          <ChipGroup
            value={draft.productType}
            onChange={(type) => setDraft((d) => selectProductType(d, type, products))}
            options={[{ value: null, label: t('common.all') }, ...types.map((type) => ({ value: type, label: typeName(type) }))]}
          />
        </View>
      ) : null}

      {sizeGroups.length > 0 ? (
        <View style={s.group}>
          <Text style={s.title}>{t('filters.size')}</Text>
          {sizeGroups.map((group) => (
            <View key={group.id} style={s.sizeGroup}>
              {sizeGroups.length > 1 ? <Text style={s.subtitle}>{t(`filters.sizeGroups.${group.id}`)}</Text> : null}
              <View style={s.sizes}>
                {group.sizes.map((size) => (
                  <Chip key={size} label={size} square selected={draft.size === size} onPress={() => setDraft((d) => selectSize(d, size))} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {bounds[1] > bounds[0] ? (
        <View style={s.group}>
          <Text style={s.title}>{t('filters.price')}</Text>
          {/* key: a category change swaps the bounds, so the slider starts over from the new window */}
          <PriceRangeSlider
            key={`${draft.categoryId ?? 'all'}-${bounds[0]}-${bounds[1]}`}
            min={bounds[0]}
            max={bounds[1]}
            value={draft.priceRange}
            onChange={(range) => setDraft((d) => setPriceRange(d, range, bounds))}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('filters.discountOnly')}
        accessibilityState={{ checked: draft.discountOnly }}
        onPress={() => setDraft((d) => ({ ...d, discountOnly: !d.discountOnly }))}
        style={s.check}
      >
        <View style={[s.box, draft.discountOnly && s.boxOn]}>{draft.discountOnly ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}</View>
        <Text style={s.checkText}>{t('filters.discountOnly')}</Text>
      </Pressable>
    </BottomSheet>
  );
}
