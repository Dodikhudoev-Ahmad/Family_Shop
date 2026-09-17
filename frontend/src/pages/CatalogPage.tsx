import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCategories } from '../context/CategoriesContext';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { ProductCardSkeleton } from '../components/ProductCard/ProductCardSkeleton';
import { FilterPanel, type Filters } from '../components/Filters/FilterPanel';
import { FilterPanelSkeleton } from '../components/Filters/FilterPanelSkeleton';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs';
import { useSeo } from '../hooks/useSeo';
import { SITE_NAME } from '../data/seo';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { fetchProductsPage } from '../lib/api';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../types/product';
import type { ProductSortBy } from '../types/api';
import './CatalogPage.css';

type SortOption = 'price-asc' | 'price-desc' | 'new' | 'popular';

const PAGE_SIZE = 8;

const SORT_TO_API: Record<SortOption, ProductSortBy> = {
  new: 0,
  'price-asc': 1,
  'price-desc': 2,
  popular: 3,
};

export function CatalogPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { categories } = useCategories();
  const { products: allProducts, isLoading: isCatalogLoading, error: catalogError } = useProducts();
  const activeCategory = categories.find((c) => c.slug === slug) ?? null;

  useSeo({
    title: activeCategory ? `${activeCategory.name} — ${SITE_NAME}` : `Каталог — ${SITE_NAME}`,
    description: activeCategory
      ? `Каталог «${activeCategory.name}» в интернет-магазине ${SITE_NAME}: широкий выбор, актуальные цены и быстрая доставка по Казахстану.`
      : `Весь каталог одежды ${SITE_NAME} — женское, мужское, детское, обувь и сумки. Быстрая доставка по Казахстану.`,
  });

  const shoesBagsNumericId = useMemo(() => {
    const id = categories.find((c) => c.slug === 'shoes-bags')?.id;
    return id ? Number(id) : null;
  }, [categories]);

  const priceBounds: [number, number] = useMemo(() => {
    if (allProducts.length === 0) return [0, 0];
    const prices = allProducts.map((p) => p.discountPrice ?? p.price);
    return [Math.min(...prices), Math.max(...prices)];
  }, [allProducts]);

  const [filters, setFilters] = useState<Filters>(() => ({
    categoryId: activeCategory?.id ?? null,
    size: null,
    priceRange: priceBounds,
    discountOnly: searchParams.get('discount') === 'true',
  }));
  const [sort, setSort] = useState<SortOption>('new');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  const [pageProducts, setPageProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilters((f) => ({ ...f, categoryId: activeCategory?.id ?? null }));
  }, [activeCategory?.id]);

  // Tracks whether the real price bounds (from loaded products) have been applied to
  // filters/debouncedPriceRange yet — until then we must not send minPrice/maxPrice at all,
  // since the placeholder [0, 0] default would filter out every product.
  const [priceRangeReady, setPriceRangeReady] = useState(false);

  useLockBodyScroll(isFilterSheetOpen);

  const availableSizes = useMemo(() => Array.from(new Set(allProducts.flatMap((p) => p.sizes))).sort(), [allProducts]);

  // Debounce price range so dragging the slider doesn't fire a request per pixel.
  const [debouncedPriceRange, setDebouncedPriceRange] = useState(filters.priceRange);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPriceRange(filters.priceRange), 350);
    return () => clearTimeout(t);
  }, [filters.priceRange]);

  useEffect(() => {
    if (allProducts.length > 0 && !priceRangeReady) {
      setFilters((f) => ({ ...f, priceRange: priceBounds }));
      setDebouncedPriceRange(priceBounds);
      setPriceRangeReady(true);
    }
  }, [allProducts.length, priceBounds, priceRangeReady]);

  const categoryIdNum = filters.categoryId ? Number(filters.categoryId) : undefined;
  const [minPrice, maxPrice] = debouncedPriceRange;
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
      minPrice: minPrice > priceBounds[0] ? minPrice : undefined,
      maxPrice: maxPrice < priceBounds[1] ? maxPrice : undefined,
      sortBy: SORT_TO_API[sort],
      page: 1,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setPageProducts(result.items.map((dto) => mapProduct(dto, shoesBagsNumericId)));
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
  }, [categoryIdNum, minPrice, maxPrice, sort, boundsReady, shoesBagsNumericId]);

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
      minPrice: minPrice > priceBounds[0] ? minPrice : undefined,
      maxPrice: maxPrice < priceBounds[1] ? maxPrice : undefined,
      sortBy: SORT_TO_API[sort],
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        setPageProducts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const next = result.items
            .map((dto) => mapProduct(dto, shoesBagsNumericId))
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
      if (filters.size && !p.sizes.includes(filters.size)) return false;
      if (filters.discountOnly && !p.discountPrice) return false;
      return true;
    });
  }, [pageProducts, filters.size, filters.discountOnly]);

  return (
    <div className="catalog container">
      {activeCategory && (
        <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: activeCategory.name }]} />
      )}
      <div className="catalog__header">
        <h1 className="catalog__title">{activeCategory?.name ?? 'Каталог'}</h1>
        <div className="catalog__toolbar">
          <button className="catalog__filter-toggle" onClick={() => setIsFilterSheetOpen(true)}>
            Фильтры
          </button>
          <select className="catalog__sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            <option value="new">По новизне</option>
            <option value="popular">По популярности</option>
            <option value="price-asc">Цена: по возрастанию</option>
            <option value="price-desc">Цена: по убыванию</option>
          </select>
        </div>
      </div>

      <div className="catalog__layout">
        <aside className="catalog__sidebar">
          {isCatalogLoading ? (
            <FilterPanelSkeleton />
          ) : (
            <FilterPanel filters={filters} onChange={setFilters} availableSizes={availableSizes} priceBounds={priceBounds} />
          )}
        </aside>

        <div className="catalog__content">
          {(error || catalogError) && (
            <p className="catalog__empty">Не удалось загрузить товары: {error ?? catalogError}</p>
          )}
          {isLoading || isCatalogLoading ? (
            <div className="catalog__grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="catalog__empty">Товары не найдены. Попробуйте изменить фильтры.</p>
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
          <span>Фильтры</span>
          <button onClick={() => setIsFilterSheetOpen(false)} aria-label="Закрыть">
            &times;
          </button>
        </div>
        {isCatalogLoading ? (
          <FilterPanelSkeleton />
        ) : (
          <FilterPanel filters={filters} onChange={setFilters} availableSizes={availableSizes} priceBounds={priceBounds} />
        )}
        <button className="btn btn--primary btn--lg catalog__sheet-apply" onClick={() => setIsFilterSheetOpen(false)}>
          Показать {visibleProducts.length}{hasMore ? '+' : ''} товаров
        </button>
      </div>
    </div>
  );
}
