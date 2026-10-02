import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBlock } from '../components/Skeleton';
import { Button, Screen, StateMessage } from '../components/ui';
import { formatPrice } from '../lib/mappers';
import { SEARCH_QUERY_MAX } from '../lib/searchHistory';
import type { Product } from '../lib/types';
import { useCategories } from '../state/CategoriesContext';
import { useProductSearch } from '../state/useProductSearch';
import { useSearchHistory } from '../state/useSearchHistory';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, paddingRight: spacing.md },
  back: { width: MIN_TOUCH_TARGET + 8, height: MIN_TOUCH_TARGET + 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  field: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgSecondary,
    paddingLeft: spacing.md,
  },
  input: { flex: 1, minWidth: 0, color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, paddingVertical: 0, minHeight: MIN_TOUCH_TARGET, outlineWidth: 0 },
  clear: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  headRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  link: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const },
  linkText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: MIN_TOUCH_TARGET + 4, borderBottomWidth: 1, borderBottomColor: c.border },
  rowMain: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: MIN_TOUCH_TARGET + 4 },
  rowText: { flex: 1, color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  rowIcon: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  thumb: { width: 56, height: 72, borderRadius: radius.sm, backgroundColor: c.bgSecondary },
  result: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm, minHeight: 88, borderBottomWidth: 1, borderBottomColor: c.border },
  resultInfo: { flex: 1, gap: 4 },
  name: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  priceNew: { color: c.accent },
});

/** Search: debounced live results from the API, recent queries on the device, "show all" opens the catalogue with the query. */
export function SearchScreen() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { categories } = useCategories();
  const { history, add, remove, clear } = useSearchHistory();
  const [input, setInput] = useState('');
  const { term, status, results, retry } = useProductSearch(input, categories);

  const openProduct = (product: Product) => {
    add(term);
    navigation.navigate('Product', { productId: Number(product.id) });
  };

  const showAll = (query: string) => {
    add(query);
    Keyboard.dismiss();
    navigation.navigate('Catalog', { search: query });
  };

  const rowsSkeleton = (
    <View style={{ gap: spacing.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBlock key={i} height={72} style={{ borderRadius: radius.md }} />
      ))}
    </View>
  );

  return (
    <Screen>
      <View style={{ paddingTop: insets.top }}>
        <View style={s.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} style={s.back}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={s.field}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => term && showAll(term)}
              returnKeyType="search"
              autoFocus
              autoCorrect={false}
              maxLength={SEARCH_QUERY_MAX}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('search.dialog')}
              style={s.input}
            />
            {input ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.clearSearch')} onPress={() => setInput('')} style={s.clear}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {status === 'idle' ? (
          history.length > 0 ? (
            <View>
              <View style={s.headRow}>
                <Text style={s.title} accessibilityRole="header">
                  {t('mobile.recentSearches')}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.clearHistory')} onPress={clear} style={s.link}>
                  <Text style={s.linkText}>{t('mobile.clearHistory')}</Text>
                </Pressable>
              </View>
              {history.map((query) => (
                <View key={query} style={s.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel={query} onPress={() => setInput(query)} style={s.rowMain}>
                    <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                    <Text style={s.rowText} numberOfLines={1}>
                      {query}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('mobile.removeFromHistory')}: ${query}`} onPress={() => remove(query)} style={s.rowIcon}>
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <StateMessage message={t('search.start')} />
          )
        ) : status === 'loading' ? (
          rowsSkeleton
        ) : status === 'error' ? (
          <StateMessage message={t('search.failed')} actionLabel={t('mobile.retry')} onAction={retry} />
        ) : results.length === 0 ? (
          <StateMessage message={t('search.nothing', { query: term })} />
        ) : (
          <View>
            {results.map((product) => (
              <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={product.name} onPress={() => openProduct(product)} style={s.result}>
                {product.images[0] ? <Image source={{ uri: product.images[0] }} style={s.thumb} accessibilityIgnoresInvertColors /> : <View style={s.thumb} />}
                <View style={s.resultInfo}>
                  <Text style={s.name} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={[s.price, product.discountPrice !== undefined && s.priceNew]}>{formatPrice(product.discountPrice ?? product.price)}</Text>
                </View>
              </Pressable>
            ))}
            <View style={{ paddingTop: spacing.md }}>
              <Button label={t('mobile.showAllResults')} variant="secondary" onPress={() => showAll(term)} />
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
