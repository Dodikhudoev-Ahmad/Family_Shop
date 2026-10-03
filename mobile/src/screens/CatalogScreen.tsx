import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { BottomSheet } from '../components/BottomSheet';
import { ChipStrip } from '../components/Chips';
import { FilterSheet } from '../components/FilterSheet';
import { ProductCard, useGridCardWidth } from '../components/ProductCard';
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
  isOfferedSort,
  type SortOption,
} from '../lib/catalog/catalogFilters';
import { availableProductTypes } from '../lib/catalog/productTypes';
import { useSmartHeader, type SmartHeader } from '../hooks/useSmartHeader';
import { useLabels } from '../i18n/labels';
import type { Category } from '../lib/types';
import type { CatalogStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { useProducts } from '../state/ProductsContext';
import { useCatalogPages } from '../state/useCatalogPages';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

type Props = NativeStackScreenProps<CatalogStackParamList, 'Catalog'>;

const SORT_LABEL_KEY = {
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
} as const;

const COLUMNS = 2;

const styles = (c: ColorTokens) => ({
  head: { gap: spacing.md, paddingBottom: spacing.sm },
  crumbs: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md },
  crumb: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const },
  crumbText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  crumbCurrent: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.sm },
  title: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.display, paddingHorizontal: spacing.md },
  toolbar: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md },
  filterBtn: {
    minHeight: MIN_TOUCH_TARGET + 4,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
  },
  select: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + 4,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
  },
  toolText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, flexShrink: 1 },
  count: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 5 },
  countText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  searchChip: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, borderRadius: radius.pill, backgroundColor: c.accentSoft, paddingHorizontal: spacing.md, marginHorizontal: spacing.md },
  searchChipText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, flexShrink: 1 },
  option: { minHeight: MIN_TOUCH_TARGET + 4, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderBottomWidth: 1, borderBottomColor: c.border },
  optionText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optionActive: { color: c.accent },
});

/** Catalogue, laid out like the website on a phone: shared header, breadcrumb, title, type chips, Filters + sort, 2-column grid. */
export function CatalogScreen(props: Props) {
  const { t } = useTranslation();
  const smart = useSmartHeader();
  const { isLoading, error, products, reload } = useProducts();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const params = props.route.params;

  // The filters' starting point (price window, type chips) comes from the whole catalogue, so wait for it.
  if (isLoading || categoriesLoading) {
    return (
      <Frame smart={smart} activeCategoryId={params?.categoryId !== undefined ? String(params.categoryId) : null}>
        <SkeletonGrid />
      </Frame>
    );
  }
  if (error && products.length === 0) {
    return (
      <Frame smart={smart} activeCategoryId={null}>
        <StateMessage message={t('mobile.productsLoadError')} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
      </Frame>
    );
  }

  // A different category / search / sort / "discounts" from outside is a different list: start it from scratch.
  return (
    <CatalogContent
      key={`${params?.categoryId ?? ''}|${params?.search ?? ''}|${params?.discount ? 1 : 0}|${params?.sort ?? ''}`}
      {...props}
      smart={smart}
      categories={categories}
    />
  );
}

function SkeletonGrid() {
  const cardWidth = useGridCardWidth();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} width={cardWidth} />
      ))}
    </View>
  );
}

/** Header + a content area that starts right below it (the header floats above and slides away on scroll). */
function Frame({ smart, activeCategoryId, children }: { smart: SmartHeader; activeCategoryId: string | null; children: ReactNode }) {
  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: smart.height }}>{children}</View>
      <AppHeader smart={smart} activeCategoryId={activeCategoryId} />
    </Screen>
  );
}

function CatalogContent(props: Props & { categories: Category[]; smart: SmartHeader }) {
  const { navigation, route, categories, smart } = props;
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { categoryName, productType: typeName } = useLabels();
  const { products: allProducts, reload: reloadProducts } = useProducts();
  const cardWidth = useGridCardWidth();

  const [filters, setFilters] = useState<CatalogFilters>(() =>
    initialFilters(allProducts, route.params?.categoryId !== undefined ? String(route.params.categoryId) : null, route.params?.discount === true)
  );
  // null = no sort chosen: the server's default order. An order from outside (home "See all" links) is applied too,
  // but only the two price orders are offered, so for any other the field keeps its "Sort" placeholder.
  const [sort, setSort] = useState<SortOption | null>(route.params?.sort ?? null);
  const offeredSort = isOfferedSort(sort) ? sort : null;
  const [search, setSearch] = useState<string | null>(route.params?.search ?? null);
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);

  useEffect(() => smart.setOverlayOpen('sheet', sheet !== null), [sheet, smart.setOverlayOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <View style={s.head}>
      <View style={{ height: smart.height }} />
      {activeCategory ? (
        <View style={s.crumbs} accessibilityRole="header">
          <Pressable accessibilityRole="link" accessibilityLabel={t('common.home')} onPress={() => navigation.navigate('HomeTab' as never)} style={s.crumb}>
            <Text style={s.crumbText}>{t('common.home')}</Text>
          </Pressable>
          <Text style={s.crumbText}> / </Text>
          <Text style={s.crumbCurrent}>{title}</Text>
        </View>
      ) : null}
      <Text style={s.title} accessibilityRole="header">
        {title}
      </Text>
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
      <View style={s.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('catalog.filters')} onPress={() => setSheet('filters')} style={s.filterBtn}>
          <Text style={s.toolText}>{t('catalog.filters')}</Text>
          {filterCount > 0 ? (
            <View style={s.count}>
              <Text style={s.countText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={offeredSort ? `${t('mobile.sort')}: ${t(SORT_LABEL_KEY[offeredSort])}` : t('mobile.sort')} onPress={() => setSheet('sort')} style={s.select}>
          <Text style={s.toolText} numberOfLines={1}>
            {offeredSort ? t(SORT_LABEL_KEY[offeredSort]) : t('mobile.sort')}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen>
      {showSkeleton ? (
        <View style={{ flex: 1 }}>
          {header}
          <SkeletonGrid />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}
          ListHeaderComponent={header}
          scrollEventThrottle={16}
          onScroll={smart.onScroll}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void reloadProducts(); pages.reload(); }} tintColor={colors.accent} progressViewOffset={smart.height} />}
          onEndReachedThreshold={0.6}
          onEndReached={pages.loadMore}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} onPress={() => navigation.navigate('Product', { productId: Number(item.id) })} />}
          ListEmptyComponent={showEmpty ? <StateMessage message={t('catalog.empty')} /> : pages.failed ? null : <SkeletonGrid />}
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

      <AppHeader smart={smart} activeCategoryId={filters.categoryId} />

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
                  // Choosing the active option again goes back to the default order.
                  setSort(option === sort ? null : option);
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
    </Screen>
  );
}
