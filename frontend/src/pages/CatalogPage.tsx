import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCategories } from '../context/CategoriesContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCard/ProductCardSkeleton';
import { FilterPanel, type Filters } from '../components/Filters/FilterPanel';
import { FilterPanelSkeleton } from '../components/Filters/FilterPanelSkeleton';
import { TypeChips } from '../components/TypeChips/TypeChips';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs';
import { useSeo } from '../hooks/useSeo';
import { useJsonLd } from '../hooks/useJsonLd';
import { breadcrumbLd } from '../utils/jsonLd';
import { categorySeoText } from '../utils/seoText';
import { SITE_NAME, SITE_URL } from '../data/seo';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { fetchProductsPage } from '../lib/api';
import { mapProduct } from '../lib/mappers';
import { availableProductTypes } from '../utils/productTypes';
import { availableSizeGroups } from '../utils/sizeGroups';
import { priceBoundsFor, resetDependentFilters } from '../utils/catalogFilters';
import type { Product } from '../types/product';
import type { ProductSortBy } from '../types/api';
import './CatalogPage.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../i18n/labels';

type SortOption = 'price-asc' | 'price-desc' | 'new' | 'popular';

// Only price sorting is offered. 'new' / 'popular' stay in the type and the mapping because the API still understands
// them (and an old link or a future caller may still ask for one): such an order is applied, the field just shows its
// "Сортировка" placeholder because none of the two choices is active.
const SORT_CHOICES: SortOption[] = ['price-asc', 'price-desc'];

const PAGE_SIZE = 8;

const SORT_TO_API: Record<SortOption, ProductSortBy> = {
  new: 0,
  'price-asc': 1,
  'price-desc': 2,
  popular: 3,
};

export function CatalogPage() {
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { products: allProducts, isLoading: isCatalogLoading, error: catalogError } = useProducts();
  const activeCategory = categories.find((c) => c.slug === slug) ?? null;

  const seoText = activeCategory
    ? categorySeoText(
        t,
        categoryName(activeCategory),
        allProducts.filter((p) => p.categoryId === activeCategory.id),
      )
    : null;
  useSeo({
    title: seoText?.title ?? t('seo.catalogTitle', { site: SITE_NAME }),
    description: seoText?.description ?? t('seo.catalogDescription', { site: SITE_NAME }),
    // An address of a category that does not exist (once the categories are known) is not a page to index.
    noindex: slug !== undefined && !activeCategory && !categoriesLoading,
  });
  useJsonLd(
    activeCategory
      ? [
          breadcrumbLd([
            { name: t('common.home'), url: `${SITE_URL}/` },
            { name: categoryName(activeCategory), url: `${SITE_URL}/catalog/${activeCategory.slug}` },
          ]),
        ]
      : [],
  );

  // The category lives in the URL and nowhere else: chips, mega menu, burger, the strip, links
  // and the filter panel's own category buttons all navigate, so every path lands in the same
  // place and the title, breadcrumbs, type list and filters can never disagree about it.
  const categoryId = activeCategory?.id ?? null;
  const navigate = useNavigate();

  // Price window of what is being browsed - a category's prices differ from the rest of the shop.
  const priceBounds = useMemo(() => priceBoundsFor(allProducts, categoryId), [allProducts, categoryId]);

  const [size, setSize] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>(priceBounds);
  const [discountOnly, setDiscountOnly] = useState(() => searchParams.get('discount') === 'true');
  const [productType, setProductType] = useState<string | null>(null);
  // null = no sort chosen: the server's default order (newest first), the placeholder is shown.
  const [sort, setSort] = useState<SortOption | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  // Debounce price range so dragging the slider doesn't fire a request per pixel. The debounced
  // value remembers which category it was typed for, so a late timer or a stale render can never
  // apply one category's price window to another (see `appliedPriceRange` below).
  const [debouncedPrice, setDebouncedPrice] = useState<{ categoryId: string | null; range: [number, number] }>({
    categoryId,
    range: priceRange,
  });

  // Changing category resets everything that depended on the old one. Done while rendering
  // (React's "adjust state on prop change" pattern), not in an effect, so the stale type/price
  // never reaches a request alongside the new category - that combination was the empty list.
  const [trackedCategoryId, setTrackedCategoryId] = useState(categoryId);
  if (trackedCategoryId !== categoryId) {
    const reset = resetDependentFilters(priceBounds);
    setTrackedCategoryId(categoryId);
    setProductType(reset.productType);
    setSize(reset.size);
    setPriceRange(reset.priceRange);
    setDebouncedPrice({ categoryId, range: reset.priceRange });
  }

  // What the panel and sheet render and report back through. The category is derived, never
  // stored: picking one in the panel is a navigation.
  const filters: Filters = useMemo(
    () => ({ categoryId, size, priceRange, discountOnly }),
    [categoryId, size, priceRange, discountOnly]
  );

  const handleFiltersChange = (next: Filters) => {
    if (next.categoryId !== categoryId) {
      const target = categories.find((c) => c.id === next.categoryId);
      navigate(target ? `/catalog/${target.slug}` : '/catalog');
      return;
    }
    setSize(next.size);
    setPriceRange(next.priceRange);
    setDiscountOnly(next.discountOnly);
  };

  const [pageProducts, setPageProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Product types present in the current category, most common first.
  const availableTypes = useMemo(
    () => availableProductTypes(allProducts, categoryId),
    [allProducts, categoryId]
  );

  // Tracks whether the real price bounds (from loaded products) have been applied to
  // the price range yet — until then we must not send minPrice/maxPrice at all,
  // since the placeholder [0, 0] default would filter out every product.
  const [priceRangeReady, setPriceRangeReady] = useState(false);

  useLockBodyScroll(isFilterSheetOpen);

  // Sizes follow what is being browsed: the chosen category and, once picked, the chosen type.
  const sizeGroups = useMemo(
    () => availableSizeGroups(allProducts, categoryId, productType),
    [allProducts, categoryId, productType]
  );

  // A size picked earlier may not exist for the newly chosen type (M, then "Кроссовки") - drop
  // it instead of silently filtering everything out.
  useEffect(() => {
    if (size && !sizeGroups.some((g) => g.sizes.includes(size))) setSize(null);
  }, [sizeGroups, size]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPrice({ categoryId, range: priceRange }), 350);
    return () => clearTimeout(t);
  }, [priceRange, categoryId]);

  useEffect(() => {
    if (allProducts.length > 0 && !priceRangeReady) {
      setPriceRange(priceBounds);
      setDebouncedPrice({ categoryId, range: priceBounds });
      setPriceRangeReady(true);
    }
  }, [allProducts.length, priceBounds, priceRangeReady, categoryId]);

  const categoryIdNum = categoryId ? Number(categoryId) : undefined;
  // A debounced value from another category is ignored: a category switch applies its fresh
  // window immediately instead of waiting out the debounce.
  const appliedPriceRange = debouncedPrice.categoryId === categoryId ? debouncedPrice.range : priceRange;
  const [minPrice, maxPrice] = appliedPriceRange;
  const boundsReady = priceRangeReady && priceBounds[1] > 0;

  // Reset to page 1 whenever a server-relevant query param changes.
  useEffect(() => {
    if (!boundsReady) return;
    let cancelled = false;
    isLoadingMoreRef.current = false;
    setIsLoading(true);
    setError(null);

    fetchProductsPage({
      categoryId: categoryIdNum,
      productType: productType ?? undefined,
      minPrice: minPrice > priceBounds[0] ? minPrice : undefined,
      maxPrice: maxPrice < priceBounds[1] ? maxPrice : undefined,
      sortBy: sort ? SORT_TO_API[sort] : undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setPageProducts(result.items.map((dto) => mapProduct(dto, categories)));
        setPage(1);
        setHasMore(result.hasMore);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryIdNum, productType, minPrice, maxPrice, sort, boundsReady, categories]);

  const loadMore = () => {
    // Guard with a ref (synchronous) rather than state alone: the IntersectionObserver
    // can fire again before a state update from setIsLoadingMore(true) has committed,
    // which previously caused the same page to be fetched twice.
    if (isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    const nextPage = page + 1;

    fetchProductsPage({
      categoryId: categoryIdNum,
      productType: productType ?? undefined,
      minPrice: minPrice > priceBounds[0] ? minPrice : undefined,
      maxPrice: maxPrice < priceBounds[1] ? maxPrice : undefined,
      sortBy: sort ? SORT_TO_API[sort] : undefined,
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        setPageProducts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const next = result.items
            .map((dto) => mapProduct(dto, categories))
            .filter((p) => !seen.has(p.id));
          return [...prev, ...next];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  };

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoadingMore, page]);

  // Size and "discount only" have no server-side equivalent (sizes are client-synthesized),
  // so they refine the already-fetched page(s) on the client.
  const visibleProducts = useMemo(() => {
    return pageProducts.filter((p) => {
      if (size && !p.sizes.includes(size)) return false;
      if (discountOnly && !p.discountPrice) return false;
      return true;
    });
  }, [pageProducts, size, discountOnly]);

  return (
    <div className="catalog container">
      {activeCategory && (
        <Breadcrumbs items={[{ label: t('common.home'), href: '/' }, { label: categoryName(activeCategory) }]} />
      )}
      <div className="catalog__header">
        <h1 className="catalog__title">{activeCategory ? categoryName(activeCategory) : t('catalog.title')}</h1>
        <TypeChips types={availableTypes} value={productType} onChange={setProductType} />
        <div className="catalog__toolbar">
          <button className="catalog__filter-toggle" onClick={() => setIsFilterSheetOpen(true)}>
            {t('catalog.filters')}
          </button>
          <select
            className="catalog__sort"
            aria-label={t('catalog.sort')}
            value={sort && SORT_CHOICES.includes(sort) ? sort : ''}
            onChange={(e) => setSort((e.target.value || null) as SortOption | null)}
          >
            {/* Choosing the placeholder again goes back to the default order. */}
            <option value="">{t('catalog.sort')}</option>
            <option value="price-asc">{t('catalog.sortPriceAsc')}</option>
            <option value="price-desc">{t('catalog.sortPriceDesc')}</option>
          </select>
        </div>
      </div>

      <div className="catalog__layout">
        <aside className="catalog__sidebar">
          {isCatalogLoading ? (
            <FilterPanelSkeleton />
          ) : (
            <FilterPanel
              filters={filters}
              onChange={handleFiltersChange}
              sizeGroups={sizeGroups}
              priceBounds={priceBounds}
              productTypes={availableTypes}
              productType={productType}
              onProductTypeChange={setProductType}
            />
          )}
        </aside>

        <div className="catalog__content">
          {(error || catalogError) && (
            <p className="catalog__empty">{t('catalog.loadError', { error: error ?? catalogError })}</p>
          )}
          {isLoading || isCatalogLoading ? (
            <div className="catalog__grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : visibleProducts.length === 0 && !hasMore ? (
            // Only once the server has nothing more to give: while pages remain, the client-side
            // filters (size, "only discounted") may just not have met a match yet.
            <p className="catalog__empty">{t('catalog.empty')}</p>
          ) : (
            <div className="catalog__grid">
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
              {isLoadingMore && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`sk-${i}`} />)}
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="catalog__sentinel" />}
        </div>
      </div>

      <div className={`catalog__sheet-overlay ${isFilterSheetOpen ? 'is-open' : ''}`} onClick={() => setIsFilterSheetOpen(false)} />
      <div className={`catalog__sheet ${isFilterSheetOpen ? 'is-open' : ''}`}>
        <div className="catalog__sheet-header">
          <span>{t('catalog.filters')}</span>
          <button onClick={() => setIsFilterSheetOpen(false)} aria-label={t('common.close')}>
            &times;
          </button>
        </div>
        {isCatalogLoading ? (
          <FilterPanelSkeleton />
        ) : (
          <FilterPanel
            filters={filters}
            onChange={handleFiltersChange}
            sizeGroups={sizeGroups}
            priceBounds={priceBounds}
            productTypes={availableTypes}
            productType={productType}
            onProductTypeChange={setProductType}
          />
        )}
        <button className="btn btn--primary btn--lg catalog__sheet-apply" onClick={() => setIsFilterSheetOpen(false)}>
          {t('catalog.show', { count: visibleProducts.length, more: hasMore ? '+' : '' })}
        </button>
      </div>
    </div>
  );
}
