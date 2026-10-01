import { useNavigation, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Button, Screen, StateMessage } from '../components/ui';
import { fetchProduct } from '../lib/api/endpoints';
import { discountPercent, formatPrice, mapProduct } from '../lib/mappers';
import type { Product } from '../lib/types';
import { useCart } from '../state/CartContext';
import { useCategories } from '../state/CategoriesContext';
import { useFavorites } from '../state/FavoritesContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { paddingBottom: spacing.xxl },
  image: { backgroundColor: c.bgSecondary },
  body: { padding: spacing.md, gap: spacing.md },
  name: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl },
  priceRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: spacing.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xl },
  priceNew: { color: c.accent },
  priceOld: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, textDecorationLine: 'line-through' as const },
  warning: { color: c.warning, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
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
  sizeText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  sizeTextActive: { color: c.white },
  actions: { flexDirection: 'row' as const, gap: spacing.sm },
  grow: { flex: 1 },
  fav: { minWidth: MIN_TOUCH_TARGET + 4 },
  description: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 22 },
  feedback: { color: c.success, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
});

export function ProductScreen({ route }: { route: RouteProp<{ Product: { productId: number } }, 'Product'> }) {
  const { productId } = route.params;
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { width } = useWindowDimensions();
  const { categories } = useCategories();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'added' | 'size' | 'stock' | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchProduct(productId)
      .then((dto) => {
        const mapped = mapProduct(dto, categories);
        setProduct(mapped);
        navigation.setOptions({ title: mapped.name });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('errors.failed')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [productId, categories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) {
    return (
      <Screen>
        {loading ? (
          <StateMessage loading message={t('common.loading')} />
        ) : (
          <StateMessage message={error ?? t('product.notFound')} actionLabel={t('mobile.retry')} onAction={load} />
        )}
      </Screen>
    );
  }

  const percent = discountPercent(product.price, product.discountPrice);
  const unitPrice = product.discountPrice ?? product.price;
  const outOfStock = product.stock <= 0;
  const favorite = isFavorite(product.id);

  const handleAdd = () => {
    if (product.sizes.length > 0 && !size) {
      setFeedback('size');
      return;
    }
    const added = addItem({ id: product.id, name: product.name, image: product.images[0], price: unitPrice, stock: product.stock }, size, 1);
    setFeedback(added > 0 ? 'added' : 'stock');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {product.images.map((uri) => (
            <Image key={uri} source={{ uri }} style={[s.image, { width, height: width * (4 / 3) }]} resizeMode="cover" accessibilityIgnoresInvertColors />
          ))}
        </ScrollView>
        {product.images.length > 1 ? <Text style={s.blockTitle} accessibilityLabel={t('common.photo', { n: imageIndex + 1 })}>{`${imageIndex + 1} / ${product.images.length}`}</Text> : null}

        <View style={s.body}>
          <Text style={s.name}>{product.name}</Text>
          <View style={s.priceRow}>
            <Text style={[s.price, product.discountPrice !== undefined && s.priceNew]}>{formatPrice(unitPrice)}</Text>
            {product.discountPrice !== undefined ? <Text style={s.priceOld}>{formatPrice(product.price)}</Text> : null}
            {percent !== null ? <Text style={s.warning}>−{percent}%</Text> : null}
          </View>
          {outOfStock ? <Text style={s.warning}>{t('common.outOfStock')}</Text> : product.stock <= 5 ? <Text style={s.warning}>{t('common.left', { count: product.stock })}</Text> : null}

          {product.sizes.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.blockTitle}>{t('product.size')}</Text>
              <View style={s.sizes}>
                {product.sizes.map((value) => {
                  const selected = size === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={value}
                      onPress={() => {
                        setSize(value);
                        setFeedback(null);
                      }}
                      style={[s.size, selected && s.sizeActive]}
                    >
                      <Text style={[s.sizeText, selected && s.sizeTextActive]}>{value}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={s.actions}>
            <Button style={s.grow} label={outOfStock ? t('common.outOfStock') : t('common.addToCart')} onPress={handleAdd} disabled={outOfStock} />
            <Button
              style={s.fav}
              variant="secondary"
              label={favorite ? '♥' : '♡'}
              accessibilityLabel={favorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}
              onPress={() => toggleFavorite(product.id)}
            />
          </View>
          {feedback === 'added' ? <Text style={s.feedback}>{t('mobile.addedToCart')}</Text> : null}
          {feedback === 'size' ? <Text style={s.error}>{t('common.chooseSize')}</Text> : null}
          {feedback === 'stock' ? <Text style={s.error}>{t('common.left', { count: product.stock })}</Text> : null}

          <Text style={s.blockTitle}>{t('product.description')}</Text>
          <Text style={s.description}>{product.description}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
