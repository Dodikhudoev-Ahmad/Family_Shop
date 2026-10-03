import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ProductReviews } from '../components/ProductReviews';
import { ProductGridSection } from '../components/ProductGridSection';
import { StarRating } from '../components/StarRating';
import { SkeletonBlock } from '../components/Skeleton';
import { Button, Screen, StateMessage } from '../components/ui';
import { fetchProduct } from '../lib/api/endpoints';
import { relatedProducts } from '../lib/catalog/homeSections';
import { isLowStock, isOutOfStock } from '../lib/catalog/stock';
import { discountPercent, formatPrice, mapProduct } from '../lib/mappers';
import type { Product } from '../lib/types';
import { useCart } from '../state/CartContext';
import { remainingStock } from '../state/cartLogic';
import { useCategories } from '../state/CategoriesContext';
import { useFavorites } from '../state/FavoritesContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { paddingBottom: spacing.xxl, gap: spacing.lg },
  gallery: { backgroundColor: c.bgSecondary },
  badges: { position: 'absolute' as const, top: spacing.md, left: spacing.md, gap: 4, alignItems: 'flex-start' as const },
  badge: { backgroundColor: c.accent, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeHit: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.accent },
  badgeText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  badgeHitText: { color: c.accent },
  dots: { position: 'absolute' as const, bottom: spacing.md, left: 0, right: 0, flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { backgroundColor: c.accent, width: 18 },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  gender: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  name: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl },
  ratingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  ratingText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  priceRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'baseline' as const, columnGap: spacing.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xl },
  priceNew: { color: c.accent },
  priceOld: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, textDecorationLine: 'line-through' as const },
  percent: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  warning: { color: c.warning, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  muted: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  blockTitle: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  sizes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  size: {
    minWidth: MIN_TOUCH_TARGET + 4,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.sm,
  },
  sizeActive: { backgroundColor: c.accent, borderColor: c.accent },
  // A size the admin doesn't sell: same box, muted, dashed border, struck-through. Still focusable (see accessibilityState).
  sizeOff: { backgroundColor: c.bgSecondary, borderStyle: 'dashed' as const },
  sizeTextOff: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  sizeNote: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm, minHeight: 20 },
  sizeText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  sizeTextActive: { color: c.white },
  sizeBadge: { position: 'absolute' as const, top: -7, right: -7, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.text, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 4 },
  sizeBadgeText: { color: c.bg, fontFamily: fonts.bodySemibold, fontSize: 11 },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'flex-start' as const, borderWidth: 1, borderColor: c.border, borderRadius: radius.md },
  step: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xl },
  stepOff: { opacity: 0.35 },
  qty: { minWidth: 36, textAlign: 'center' as const, color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  actions: { flexDirection: 'row' as const, gap: spacing.sm },
  fav: { width: MIN_TOUCH_TARGET + 4, minHeight: MIN_TOUCH_TARGET + 4, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  feedback: { color: c.success, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  link: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, minHeight: MIN_TOUCH_TARGET, textAlignVertical: 'center' as const },
  section: { gap: spacing.xs },
  text: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 22 },
});

// How long the "size unavailable" explanation stays.
const UNAVAILABLE_NOTE_MS = 4000;

type Feedback = 'added' | 'size' | 'stock' | 'line-quantity' | 'lines' | null;

export function ProductScreen({ route }: { route: RouteProp<{ Product: { productId: number } }, 'Product'> }) {
  const { productId } = route.params;
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { width: windowWidth } = useWindowDimensions();
  const { categories } = useCategories();
  const { products: allProducts } = useProducts();
  const { lines, addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  // Shown at once from the already-loaded catalogue, then refreshed from the API (stock may have moved).
  const known = allProducts.find((p) => p.id === String(productId)) ?? null;
  const [product, setProduct] = useState<Product | null>(known);
  const [loading, setLoading] = useState(known === null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  // The size whose "unavailable" explanation is shown under the sizes (a live region; no modal, no toast).
  const [unavailableSize, setUnavailableSize] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [galleryWidth, setGalleryWidth] = useState(windowWidth);
  const galleryRef = useRef<ScrollView>(null);

  const load = () => {
    setLoading(product === null);
    setError(null);
    fetchProduct(productId)
      .then((dto) => setProduct(mapProduct(dto, categories)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('errors.failed')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [productId, categories.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const showUnavailable = (value: string) => {
    clearTimeout(noteTimer.current);
    setUnavailableSize(value);
    noteTimer.current = setTimeout(() => setUnavailableSize(null), UNAVAILABLE_NOTE_MS);
  };
  const selectSize = (value: string) => {
    clearTimeout(noteTimer.current);
    setUnavailableSize(null);
    setSize(value);
    setFeedback(null);
  };

  useEffect(() => {
    if (product) navigation.setOptions({ title: product.name });
  }, [product?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const related = useMemo(() => (product ? relatedProducts(allProducts, product) : []), [allProducts, product]);

  if (!product) {
    return (
      <Screen>
        {loading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonBlock height={0} style={{ aspectRatio: 3 / 4, height: undefined, borderRadius: 0 }} />
            <View style={{ padding: spacing.md, gap: spacing.sm }}>
              <SkeletonBlock height={28} width="70%" />
              <SkeletonBlock height={22} width="35%" />
            </View>
          </View>
        ) : (
          <StateMessage message={error ?? t('product.notFound')} actionLabel={t('mobile.retry')} onAction={load} />
        )}
      </Screen>
    );
  }

  const percent = discountPercent(product.price, product.discountPrice);
  const unitPrice = product.discountPrice ?? product.price;
  const outOfStock = isOutOfStock(product.stock);
  const favorite = isFavorite(product.id);
  const showGender = categories.find((c) => c.id === product.categoryId)?.hasSizes ?? false;

  // The stock is shared by every size of the product, so the room left is aggregated over all its cart lines.
  const room = remainingStock(lines, product.id, product.stock);
  const inCart = (value: string | null) => lines.find((l) => l.productId === product.id && l.size === value)?.quantity ?? 0;
  const selectedInCart = inCart(size);
  const effectiveQuantity = Math.min(quantity, Math.max(room, 1));

  // The whole grid is shown; the ones missing from product.sizes are muted and can't be picked.
  const gridSizes = product.gridSizes ?? product.sizes;
  // Nothing can be added until an available size is picked.
  const needsSize = gridSizes.length > 0 && !(size && product.sizes.includes(size));

  const handleAdd = () => {
    if (needsSize) {
      setFeedback('size');
      return;
    }
    const { limit } = addItem({ id: product.id, name: product.name, image: product.images[0], price: unitPrice, stock: product.stock }, size, effectiveQuantity);
    setFeedback(limit ?? 'added');
    setQuantity(1);
  };

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / galleryWidth));
  const onGalleryLayout = (e: LayoutChangeEvent) => setGalleryWidth(e.nativeEvent.layout.width);

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}>
        <View style={s.gallery} onLayout={onGalleryLayout}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={onGalleryScroll}
          >
            {product.images.map((uri, i) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: galleryWidth, height: galleryWidth * (4 / 3) }}
                resizeMode="cover"
                accessibilityLabel={t('common.photo', { n: i + 1 })}
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
          {outOfStock || percent !== null || product.isBestseller ? (
            <View style={s.badges}>
              {percent !== null && !outOfStock ? (
                <View style={s.badge}>
                  <Text style={s.badgeText}>−{percent}%</Text>
                </View>
              ) : null}
              {product.isBestseller && !outOfStock ? (
                <View style={[s.badge, s.badgeHit]}>
                  <Text style={[s.badgeText, s.badgeHitText]}>{t('card.hit')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {product.images.length > 1 ? (
            <View style={s.dots} accessibilityLabel={t('common.photo', { n: imageIndex + 1 })}>
              {product.images.map((uri, i) => (
                <View key={uri} style={[s.dot, i === imageIndex && s.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={s.body}>
          <View style={{ gap: 6 }}>
            {showGender ? <Text style={s.gender}>{t(`gender.${product.gender}`)}</Text> : null}
            <Text style={s.name}>{product.name}</Text>
            {product.reviewCount > 0 ? (
              <View style={s.ratingRow}>
                <StarRating value={product.averageRating} size={15} />
                <Text style={s.ratingText}>
                  {product.averageRating.toFixed(1)} · {t('reviews.count', { count: product.reviewCount })}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={s.priceRow}>
            <Text style={[s.price, product.discountPrice !== undefined && s.priceNew]}>{formatPrice(unitPrice)}</Text>
            {product.discountPrice !== undefined ? <Text style={s.priceOld}>{formatPrice(product.price)}</Text> : null}
            {percent !== null ? <Text style={s.percent}>−{percent}%</Text> : null}
          </View>
          {outOfStock ? (
            <Text style={s.warning}>{t('common.outOfStock')}</Text>
          ) : isLowStock(product.stock) ? (
            <Text style={s.warning}>{t('common.left', { count: product.stock })}</Text>
          ) : (
            <Text style={s.muted}>{t('mobile.stockLeft', { count: product.stock })}</Text>
          )}

          {gridSizes.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.blockTitle}>{t('product.size')}</Text>
              <View style={s.sizes}>
                {gridSizes.map((value) => {
                  const selected = size === value;
                  const count = inCart(value);
                  const unavailable = !product.sizes.includes(value);
                  // Not `disabled`: an unavailable size stays focusable and pressable, so it can say why it can't be chosen.
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: outOfStock || unavailable }}
                      accessibilityLabel={
                        unavailable ? t('product.sizeUnavailableAria', { size: value }) : count > 0 ? `${value}, ${t('product.inCartAria', { count })}` : value
                      }
                      disabled={outOfStock}
                      onPress={() => (unavailable ? showUnavailable(value) : selectSize(value))}
                      style={[s.size, selected && s.sizeActive, unavailable && s.sizeOff, outOfStock && s.stepOff]}
                    >
                      <Text style={[s.sizeText, selected && s.sizeTextActive, unavailable && s.sizeTextOff]}>{value}</Text>
                      {count > 0 ? (
                        <View style={s.sizeBadge}>
                          <Text style={s.sizeBadgeText}>{count}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.sizeNote} accessibilityLiveRegion="polite">
                {unavailableSize ? t('product.sizeUnavailableNote', { size: unavailableSize }) : ''}
              </Text>
            </View>
          ) : null}

          {!outOfStock ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.blockTitle}>{t('product.quantity')}</Text>
              <View style={s.stepper}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('product.decrease')} disabled={effectiveQuantity <= 1} onPress={() => setQuantity(Math.max(1, effectiveQuantity - 1))} style={[s.step, effectiveQuantity <= 1 && s.stepOff]}>
                  <Text style={s.stepText}>−</Text>
                </Pressable>
                <Text style={s.qty}>{effectiveQuantity}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('product.increase')} disabled={effectiveQuantity >= room} onPress={() => setQuantity(Math.min(room, effectiveQuantity + 1))} style={[s.step, effectiveQuantity >= room && s.stepOff]}>
                  <Text style={s.stepText}>+</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={s.actions}>
            <Button
              style={{ flex: 1 }}
              label={outOfStock ? t('common.outOfStock') : room === 0 ? t('common.left', { count: product.stock }) : selectedInCart > 0 ? t('product.addMore') : t('common.addToCart')}
              onPress={handleAdd}
              disabled={outOfStock || room === 0 || needsSize}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}
              accessibilityState={{ selected: favorite }}
              onPress={() => toggleFavorite(product.id)}
              style={s.fav}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={favorite ? colors.accent : colors.text} />
            </Pressable>
          </View>
          {needsSize && !outOfStock && feedback !== 'size' ? <Text style={s.muted}>{t('common.chooseSize')}</Text> : null}
          {feedback === 'added' ? <Text style={s.feedback}>{t('mobile.addedToCart')}</Text> : null}
          {feedback === 'size' ? <Text style={s.error}>{t('common.chooseSize')}</Text> : null}
          {feedback === 'stock' ? <Text style={s.error}>{t('common.left', { count: product.stock })}</Text> : null}
          {feedback === 'line-quantity' ? <Text style={s.error}>{t('mobile.cartMaxQty', { n: 50 })}</Text> : null}
          {feedback === 'lines' ? <Text style={s.error}>{t('mobile.cartTooManyLines', { n: 50 })}</Text> : null}
          {selectedInCart > 0 ? (
            <Pressable accessibilityRole="link" accessibilityLabel={t('product.inCartLine', { count: selectedInCart, size: size ? ` (${size})` : '' })} onPress={() => navigation.navigate('CartTab')}>
              <Text style={s.link}>{t('product.inCartLine', { count: selectedInCart, size: size ? ` (${size})` : '' })}</Text>
            </Pressable>
          ) : null}

          <View style={s.section}>
            <Text style={s.blockTitle}>{t('product.description')}</Text>
            <Text style={s.text}>{product.description}</Text>
          </View>
          <View style={s.section}>
            <Text style={s.blockTitle}>{t('product.delivery')}</Text>
            <Text style={s.text}>{t('product.deliveryText')}</Text>
          </View>
        </View>

        <View style={s.body}>
          <ProductReviews productId={Number(product.id)} onChanged={load} />
        </View>

        <ProductGridSection
          title={t('product.similar')}
          products={related}
          onOpen={(p) => navigation.push('Product', { productId: Number(p.id) })}
          onSeeAll={() => navigation.navigate('CatalogTab', { screen: 'Catalog', params: { categoryId: Number(product.categoryId) } })}
        />
      </ScrollView>
    </Screen>
  );
}
