import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../components/BottomSheet';
import { ChipStrip } from '../components/Chips';
import { FilterSheet } from '../components/FilterSheet';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import { Screen, StateMessage } from '../components/ui';
import {
  activeFilterCount,
  buildProductQuery,
  initialFilters,
  priceBoundsFor,
  refineLoaded,
  selectProductType,
  shouldAutoLoadMore,
  shouldShowEmpty,
  SORT_OPTIONS,
  type CatalogFilters,
  type SortOption,
} from '../lib/catalog/catalogFilters';
import { availableProductTypes } from '../lib/catalog/productTypes';
import { useLabels } from '../i18n/labels';
import type { CatalogStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { useProducts } from '../state/ProductsContext';
import { useCatalogPages } from '../state/useCatalogPages';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

type Props = NativeStackScreenProps<CatalogStackParamList, 'Catalog'>;

const SORT_LABEL_KEY: Record<SortOption, 'catalog.sortNew' | 'catalog.sortPopular' | 'catalog.sortPriceAsc' | 'catalog.sortPriceDesc'> = {
  new: 'catalog.sortNew',
  popular: 'catalog.sortPopular',
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
};

const COLUMNS = 2;

const styles = (c: ColorTokens) => ({
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: MIN_TOUCH_TARGET + 8, paddingRight: spacing.md },
  back: { width: MIN_TOUCH_TARGET + 8, height: MIN_TOUCH_TARGET + 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { flex: 1, color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  toolbar: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  tool: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.sm,
  },
  toolText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, flexShrink: 1 },
  count: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 5 },
  countText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  searchChip: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, borderRadius: radius.pill, backgroundColor: c.accentSoft, paddingHorizontal: spacing.md, marginHorizontal: spacing.md },
  searchChipText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, flexShrink: 1 },
  option: { minHeight: MIN_TOUCH_TARGET + 4, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1, borderBottomColor: c.border },
  optionText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optionActive: { color: c.accent },
});

/** Catalogue: 2-column grid, server paging with infinite scroll, sort, type chips and filters in a bottom sheet. */
export function CatalogScreen(props: Props) {
  const { t } = useTranslation();
  const { isLoading, error, products, reload } = useProducts();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const params = props.route.params;

  // The filters' starting point (price window, type chips) comes from the whole catalogue, so wait for it.
  if (isLoading || categoriesLoading) {
    return (
      <CatalogFrame {...props} title={t('catalog.title')}>
        <SkeletonGrid />
      </CatalogFrame>
    );
  }
  if (error && products.length === 0) {
    return (
      <CatalogFrame {...props} title={t('catalog.title')}>
        <StateMessage message={t('mobile.productsLoadError')} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
      </CatalogFrame>
    );
  }

  // A different category / search / "discounts" from outside is a different list: start it from scratch.
  return <CatalogContent key={`${params?.categoryId ?? ''}|${params?.search ?? ''}|${params?.discount ? 1 : 0}`} {...props} categories={categories} />;
}

function useGridWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - spacing.md * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS);
}

function SkeletonGrid() {
  const cardWidth = useGridWidth();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} width={cardWidth} />
      ))}
    </View>
  );
}

function CatalogFrame({ navigation, title, children, toolbar }: Props & { title: string; children: React.ReactNode; toolbar?: React.ReactNode }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <View style={{ paddingTop: insets.top }}>
        <View style={s.topBar}>
          {navigation.canGoBack() ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} style={s.back}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: spacing.md }} />
          )}
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.search')} onPress={() => navigation.navigate('Search')} style={s.back}>
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
        </View>
        {toolbar}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Screen>
  );
}

function CatalogContent(props: Props & { categories: ReturnType<typeof useCategories>['categories'] }) {
  const { navigation, route, categories } = props;
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categoryName, productType: typeName } = useLabels();
  const { products: allProducts } = useProducts();
  const cardWidth = useGridWidth();

  const [filters, setFilters] = useState<CatalogFilters>(() =>
    initialFilters(allProducts, route.params?.categoryId !== undefined ? String(route.params.categoryId) : null, route.params?.discount === true)
  );
  const [sort, setSort] = useState<SortOption>('new');
  const [search, setSearch] = useState<string | null>(route.params?.search ?? null);
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);

  // What the server is asked: category, type, price window, search, sort. Size and "only discounted" refine locally.
  const bounds = useMemo(() => priceBoundsFor(allProducts, filters.categoryId), [allProducts, filters.categoryId]);
  const buildQuery = (page: number) => buildProductQuery(filters, bounds, sort, search, page);
  const queryKey = JSON.stringify(buildQuery(1));
  const pages = useCatalogPages(queryKey, buildQuery, categories);

  const visible = useMemo(() => refineLoaded(pages.items, filters), [pages.items, filters]);
  const listState = { visibleCount: visible.length, hasMore: pages.hasMore, loading: pages.loading, failed: pages.failed };

  // When the local filters hide most of a page the list may be too short to scroll, so onEndReached would
  // never fire: keep fetching until the screen is full or the server has nothing more.
  const autoLoad = shouldAutoLoadMore(listState);
  useEffect(() => {
    if (autoLoad) pages.loadMore();
  }, [autoLoad, pages.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = useMemo(() => availableProductTypes(allProducts, filters.categoryId), [allProducts, filters.categoryId]);
  const activeCategory = categories.find((c) => c.id === filters.categoryId);
  const title = activeCategory ? categoryName(activeCategory) : t('catalog.title');
  const filterCount = activeFilterCount(filters, bounds);

  const showEmpty = shouldShowEmpty(listState);
  const showSkeleton = pages.items.length === 0 && pages.loading;

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      {search ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.clearSearch')} onPress={() => setSearch(null)} style={s.searchChip}>
          <Text style={s.searchChipText} numberOfLines={1}>
            {t('mobile.searchResults', { query: search })}
          </Text>
          <Ionicons name="close" size={16} color={colors.text} />
        </Pressable>
      ) : null}
      {types.length > 1 ? (
        <ChipStrip
          value={filters.productType}
          onChange={(type) => setFilters((f) => selectProductType(f, type, allProducts))}
          options={[{ value: null, label: t('common.all') }, ...types.map((type) => ({ value: type, label: typeName(type) }))]}
        />
      ) : null}
    </View>
  );

  const toolbar = (
    <View style={s.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('catalog.filters')} onPress={() => setSheet('filters')} style={s.tool}>
        <Ionicons name="options-outline" size={18} color={colors.text} />
        <Text style={s.toolText} numberOfLines={1}>
          {t('catalog.filters')}
        </Text>
        {filterCount > 0 ? (
          <View style={s.count}>
            <Text style={s.countText}>{filterCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('mobile.sort')}: ${t(SORT_LABEL_KEY[sort])}`} onPress={() => setSheet('sort')} style={s.tool}>
        <Ionicons name="swap-vertical-outline" size={18} color={colors.text} />
        <Text style={s.toolText} numberOfLines={1}>
          {t(SORT_LABEL_KEY[sort])}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <CatalogFrame {...props} title={title} toolbar={toolbar}>
      {showSkeleton ? (
        <>
          {header}
          <SkeletonGrid />
        </>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}
          ListHeaderComponent={header}
          refreshing={false}
          onRefresh={pages.reload}
          onEndReachedThreshold={0.6}
          onEndReached={pages.loadMore}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} onPress={() => navigation.navigate('Product', { productId: Number(item.id) })} />}
          ListEmptyComponent={
            showEmpty ? (
              <StateMessage message={t('catalog.empty')} />
            ) : pages.failed ? null : (
              <SkeletonGrid />
            )
          }
          ListFooterComponent={
            pages.failed ? (
              <StateMessage message={t('mobile.productsLoadError')} actionLabel={t('mobile.retry')} onAction={pages.retry} />
            ) : pages.loading && visible.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }}>
                <ProductCardSkeleton width={cardWidth} />
                <ProductCardSkeleton width={cardWidth} />
              </View>
            ) : null
          }
        />
      )}

      {sheet === 'filters' ? (
        <FilterSheet
          filters={filters}
          products={allProducts}
          categories={categories}
          searching={search !== null}
          onClose={() => setSheet(null)}
          onApply={(next) => {
            setFilters(next);
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === 'sort' ? (
        <BottomSheet visible title={t('mobile.sort')} onClose={() => setSheet(null)}>
          <View>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={t(SORT_LABEL_KEY[option])}
                accessibilityState={{ selected: option === sort }}
                onPress={() => {
                  setSort(option);
                  setSheet(null);
                }}
                style={s.option}
              >
                <Text style={[s.optionText, option === sort && s.optionActive]}>{t(SORT_LABEL_KEY[option])}</Text>
                {option === sort ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
              </Pressable>
            ))}
          </View>
        </BottomSheet>
      ) : null}
    </CatalogFrame>
  );
}
