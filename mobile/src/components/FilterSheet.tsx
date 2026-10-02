import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  clampPriceRange,
  countMatching,
  initialFilters,
  priceBoundsFor,
  selectCategory,
  selectProductType,
  selectSize,
  setPriceRange,
  type CatalogFilters,
  type PriceRange,
} from '../lib/catalog/catalogFilters';
import { availableProductTypes } from '../lib/catalog/productTypes';
import { availableSizeGroups } from '../lib/catalog/sizeGroups';
import { formatPrice } from '../lib/mappers';
import type { Category, Product } from '../lib/types';
import { useLabels } from '../i18n/labels';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Chip, ChipGroup } from './Chips';
import { Button } from './ui';

const styles = (c: ColorTokens) => ({
  group: { gap: spacing.sm },
  title: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  subtitle: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  sizeGroup: { gap: spacing.xs },
  priceRow: { flexDirection: 'row' as const, gap: spacing.sm },
  priceField: { flex: 1, gap: 4 },
  priceLabel: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  priceInput: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    color: c.text,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
  },
  hint: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  check: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  boxOn: { backgroundColor: c.accent, borderColor: c.accent },
  checkText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, flexShrink: 1 },
  footer: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** Editable "from / to" price fields. Texts are local while typing; the committed range is always clamped. */
function PriceInputs({ range, bounds, onChange }: { range: PriceRange; bounds: PriceRange; onChange: (range: PriceRange) => void }) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const [texts, setTexts] = useState<[string, string]>([String(range[0]), String(range[1])]);

  const edit = (index: 0 | 1, text: string) => {
    const digits = text.replace(/\D/g, '');
    const next: [string, string] = index === 0 ? [digits, texts[1]] : [texts[0], digits];
    setTexts(next);
    onChange([next[0] === '' ? bounds[0] : Number(next[0]), next[1] === '' ? bounds[1] : Number(next[1])]);
  };

  // On blur the fields show what was really applied (a typed 5 against a 900 floor reads 900).
  const normalise = () => {
    const clamped = clampPriceRange([texts[0] === '' ? bounds[0] : Number(texts[0]), texts[1] === '' ? bounds[1] : Number(texts[1])], bounds);
    setTexts([String(clamped[0]), String(clamped[1])]);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={s.priceRow}>
        {([0, 1] as const).map((i) => (
          <View key={i} style={s.priceField}>
            <Text style={s.priceLabel}>{i === 0 ? t('mobile.priceFrom') : t('mobile.priceTo')}</Text>
            <TextInput
              value={texts[i]}
              onChangeText={(text) => edit(i, text)}
              onBlur={normalise}
              onSubmitEditing={normalise}
              keyboardType="number-pad"
              inputMode="numeric"
              accessibilityLabel={i === 0 ? t('mobile.priceFrom') : t('mobile.priceTo')}
              style={s.priceInput}
            />
          </View>
        ))}
      </View>
      <Text style={s.hint}>{t('mobile.priceRange', { min: formatPrice(bounds[0]), max: formatPrice(bounds[1]) })}</Text>
    </View>
  );
}

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
          <Button variant="secondary" label={t('mobile.reset')} onPress={() => setDraft(initialFilters(products, null))} />
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {group.sizes.map((size) => (
                  <Chip key={size} label={size} selected={draft.size === size} onPress={() => setDraft((d) => selectSize(d, size))} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {bounds[1] > bounds[0] ? (
        <View style={s.group}>
          <Text style={s.title}>{t('filters.price')}</Text>
          {/* key: a category change swaps the bounds, so the fields start over from the new window */}
          <PriceInputs
            key={`${draft.categoryId ?? 'all'}-${bounds[0]}-${bounds[1]}`}
            range={draft.priceRange}
            bounds={bounds}
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
