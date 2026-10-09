import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCategories } from '../context/CategoriesContext';
import { fetchProduct } from '../lib/api';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../types/product';
import { useRecentlyViewed } from '../context/RecentlyViewedContext';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs';
import { RecentlyViewed } from '../components/RecentlyViewed/RecentlyViewed';
import { absoluteImage, useSeo } from '../hooks/useSeo';
import { useJsonLd } from '../hooks/useJsonLd';
import { breadcrumbLd, productLd } from '../utils/jsonLd';
import { SITE_NAME, SITE_URL } from '../data/seo';
import { productSeoText } from '../utils/seoText';
import { formatPrice } from '../utils/formatPrice';
import { isLowStock, isOutOfStock } from '../utils/stock';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Slider } from '../components/Slider/Slider';
import { Accordion } from '../components/Accordion/Accordion';
import { SizeSelector } from '../components/SizeSelector/SizeSelector';
import { Button } from '../components/Button/Button';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { StarRating } from '../components/StarRating/StarRating';
import { ProductReviews } from '../components/Reviews/ProductReviews';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import './ProductPage.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../i18n/labels';

// How long the "size unavailable" explanation stays.
const UNAVAILABLE_NOTE_MS = 4000;

export function ProductPage() {
  const { categoryName } = useLabels();
  const { t } = useTranslation();
  const { id } = useParams();
  const { products, isLoading } = useProducts();
  const { categories, isLoading: categoriesLoading } = useCategories();
  const known = products.find((p) => p.id === id);
  // The catalogue in the context is loaded once when the app opens. A product added (or restored) after that is in the
  // catalogue page - it asks the API afresh - but not in this list, so the page asks the API for it by id before
  // giving up. Not-found is only for an id the API itself doesn't know.
  const [fetched, setFetched] = useState<{ id: string; product: Product | null } | null>(null);
  const product = known ?? (fetched && fetched.id === id ? (fetched.product ?? undefined) : undefined);
  const isFetchingMissing = !known && id !== undefined && !(fetched && fetched.id === id);
  const { lines: cartLines, addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const { addViewed } = useRecentlyViewed();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  // The size whose "unavailable" explanation is on screen (a live region under the sizes, no modal / toast).
  const [unavailableSize, setUnavailableSize] = useState<string | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);

  const showUnavailable = (size: string) => {
    window.clearTimeout(noteTimer.current);
    setUnavailableSize(size);
    noteTimer.current = window.setTimeout(() => setUnavailableSize(null), UNAVAILABLE_NOTE_MS);
  };
  const selectSize = (size: string) => {
    window.clearTimeout(noteTimer.current);
    setUnavailableSize(null);
    setSelectedSize(size);
  };
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  useEffect(() => {
    if (known || id === undefined || isLoading || categoriesLoading) return;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setFetched({ id, product: null });
      return;
    }
    let cancelled = false;
    fetchProduct(numericId)
      .then((dto) => !cancelled && setFetched({ id, product: mapProduct(dto, categories) }))
      .catch(() => !cancelled && setFetched({ id, product: null }));
    return () => {
      cancelled = true;
    };
  }, [id, known, isLoading, categoriesLoading, categories]);

  const seoText = product ? productSeoText(t, product) : null;
  useSeo({
    title: seoText?.title ?? (isLoading || isFetchingMissing ? SITE_NAME : t('seo.notFoundTitle', { site: SITE_NAME })),
    description: seoText?.description ?? (isLoading || isFetchingMissing ? t('seo.defaultDescription') : t('product.notFound')),
    image: product?.images[0],
    type: product ? 'product' : 'website',
    price: product ? (product.discountPrice ?? product.price) : undefined,
    // A product that does not exist (the API does not know the id either) must not be indexed.
    noindex: !product && !isLoading && !isFetchingMissing,
  });

  // Structured data for Google (the bots that do not run JS get the same objects from the API: backend/Api/Seo/JsonLd.cs).
  const ldCategory = product ? categories.find((c) => c.id === product.categoryId) : undefined;
  const ldUrl = product ? `${SITE_URL}/product/${product.id}` : '';
  useJsonLd(
    product && seoText
      ? [
          productLd({
            id: product.id,
            name: product.name,
            description: seoText.description,
            price: product.discountPrice ?? product.price,
            stock: product.stock,
            images: product.images.map(absoluteImage),
            fallbackImage: absoluteImage(undefined),
            url: ldUrl,
            rating: product.averageRating,
            reviewCount: product.reviewCount,
          }),
          breadcrumbLd([
            { name: t('common.home'), url: `${SITE_URL}/` },
            ...(ldCategory ? [{ name: categoryName(ldCategory), url: `${SITE_URL}/catalog/${ldCategory.slug}` }] : []),
            { name: product.name, url: ldUrl },
          ]),
        ]
      : [],
  );

  // Only a full page view counts as "viewed" - Quick View opens intentionally
  // don't call this, since a hover/tap-to-peek is a weaker signal of interest.
  useEffect(() => {
    if (product) addViewed(product.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (isLoading || isFetchingMissing) {
    return <div className="container product-page__not-found">{t('common.loading')}</div>;
  }

  if (!product) {
    return (
      <div className="container product-page__not-found">
        <p>{t('product.notFound')}</p>
        <Link to="/">{t('common.toHome')}</Link>
      </div>
    );
  }

  // Same-type items first (shoes next to shoes), since shoes/bags share a category with clothes.
  const related = products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .sort((a, b) => Number(b.productType === product.productType) - Number(a.productType === product.productType))
    .slice(0, 8);
  const productCategory = categories.find((c) => c.id === product.categoryId);
  const favorite = isFavorite(product.id);
  const outOfStock = isOutOfStock(product.stock);
  const lowStock = isLowStock(product.stock);

  // Quantity of THIS product already in the cart, per size (or under the sizeless "onesize" key)
  // - drives the size-button badges and the "В корзину" → "Добавить ещё" switch below.
  const cartQuantityFor = (size: string | null) =>
    cartLines.find((l) => l.product.id === product.id && l.size === size)?.quantity ?? 0;
  const selectedSizeCartQuantity = cartQuantityFor(selectedSize);

  // The whole grid is shown; the ones missing from product.sizes are muted and can't be picked.
  const gridSizes = product.gridSizes ?? product.sizes;
  // Nothing can be added until an available size is picked (the button stays focusable: pressing it says why).
  const needsSize = gridSizes.length > 0 && !(selectedSize && product.sizes.includes(selectedSize));

  const handleAddToCart = () => {
    if (needsSize) {
      showToast(t('common.chooseSize'), 'error');
      return;
    }
    addItem(product, selectedSize, quantity);
  };

  return (
    <div className="container product-page">
      <Breadcrumbs
        items={[
          { label: t('common.home'), href: '/' },
          ...(productCategory ? [{ label: categoryName(productCategory), href: `/catalog/${productCategory.slug}` }] : []),
          { label: product.name },
        ]}
      />
      <div className="product-page__layout">
        <div className="product-page__gallery">
          <div className="product-page__main-image">
            <FadeImage src={product.images[activeImage]} alt={product.name} />
          </div>
          <div className="product-page__thumbs">
            {product.images.map((img, i) => (
              <button
                key={img}
                className={`product-page__thumb ${activeImage === i ? 'is-active' : ''}`}
                onClick={() => setActiveImage(i)}
                aria-label={t('common.photo', { n: i + 1 })}
              >
                <FadeImage src={img} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="product-page__details">
          {productCategory?.hasSizes !== false && (
            <span className="product-page__category">{t(`gender.${product.gender}`)}</span>
          )}
          <h1 className="product-page__name">{product.name}</h1>
          {product.reviewCount > 0 && (
            <div className="product-page__rating">
              <StarRating value={product.averageRating} size="sm" />
              <span>
                {product.averageRating.toFixed(1)} · {t('reviews.count', { count: product.reviewCount })}
              </span>
            </div>
          )}
          <div className="product-page__price">
            {product.discountPrice && <span className="product-page__price-old">{formatPrice(product.price)}</span>}
            <span className={product.discountPrice ? 'product-page__price-new' : ''}>
              {formatPrice(product.discountPrice ?? product.price)}
            </span>
          </div>
          {lowStock && <span className="product-page__stock-warning">{t('common.left', { count: product.stock })}</span>}
          {outOfStock && <span className="product-page__stock-warning product-page__stock-warning--out">{t('common.outOfStock')}</span>}

          {gridSizes.length > 0 && (
            <div className="product-page__block">
              <span className="product-page__block-title">{t('product.size')}</span>
              <SizeSelector
                className="product-page__sizes"
                gridSizes={gridSizes}
                sizes={product.sizes}
                selected={selectedSize}
                onSelect={selectSize}
                onUnavailable={showUnavailable}
                renderBadge={(size) => {
                  const inCartQuantity = cartQuantityFor(size);
                  return inCartQuantity > 0 ? (
                    <span className="size-btn__badge" aria-label={t('product.inCartAria', { count: inCartQuantity })}>
                      {inCartQuantity}
                    </span>
                  ) : null;
                }}
              />
              <p className="product-page__size-note" role="status" aria-live="polite">
                {unavailableSize ? t('product.sizeUnavailableNote', { size: unavailableSize }) : ''}
              </p>
            </div>
          )}

          {!outOfStock && (
            <div className="product-page__block">
              <span className="product-page__block-title">{t('product.quantity')}</span>
              <div className="quantity-stepper">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t('product.decrease')}>
                  −
                </button>
                <span>{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock}
                  aria-label={t('product.increase')}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="product-page__actions">
            <Button
              variant="primary"
              size="lg"
              className="product-page__add-btn"
              onClick={handleAddToCart}
              disabled={outOfStock}
              aria-disabled={needsSize || undefined}
            >
              {outOfStock ? t('common.outOfStock') : selectedSizeCartQuantity > 0 ? t('product.addMore') : t('common.addToCart')}
            </Button>
            <button
              className={`product-page__fav-btn ${favorite ? 'is-active' : ''}`}
              aria-label={favorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}
              onClick={() => toggleFavorite(product.id, product.name)}
            >
              <HeartIcon filled={favorite} />
            </button>
          </div>
          {selectedSizeCartQuantity > 0 && (
            <Link to="/cart" className="product-page__in-cart-note">
              {t('product.inCartLine', { count: selectedSizeCartQuantity, size: selectedSize ? ` (${selectedSize})` : '' })}
            </Link>
          )}

          <div className="product-page__accordions">
            <Accordion title={t('product.description')} defaultOpen>
              <p>{product.description}</p>
            </Accordion>
            <Accordion title={t('product.delivery')}>
              <p>{t('product.deliveryText')}</p>
            </Accordion>
            <Accordion title={t('product.composition')}>
              <p>{t('product.compositionText')}</p>
            </Accordion>
          </div>
        </div>
      </div>

      <ProductReviews productId={Number(product.id)} />

      {related.length > 0 && (
        <section className="product-page__related">
          <h3 className="home-section__title">{t('product.similar')}</h3>
          <Slider>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </Slider>
        </section>
      )}

      <RecentlyViewed excludeId={product.id} className="home-section" />
    </div>
  );
}


function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M10 17.5s-7-4.35-7-9.5A4 4 0 0 1 10 5.5 4 4 0 0 1 17 8c0 5.15-7 9.5-7 9.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
