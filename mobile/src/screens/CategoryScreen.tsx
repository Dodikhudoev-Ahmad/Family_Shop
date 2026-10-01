import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { ProductCard } from '../components/ProductCard';
import { Screen, StateMessage } from '../components/ui';
import { fetchProductsPage } from '../lib/api/endpoints';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../lib/types';
import type { CatalogStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { spacing } from '../theme/tokens';

const PAGE_SIZE = 12;

/** Products of one category, paged from the real API (newest first). */
export function CategoryScreen({ navigation, route }: NativeStackScreenProps<CatalogStackParamList, 'Category'>) {
  const { categoryId } = route.params;
  const { t } = useTranslation();
  const { categories } = useCategories();

  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchProductsPage({ categoryId, page: nextPage, pageSize: PAGE_SIZE, sortBy: 0 });
        const mapped = result.items.map((dto) => mapProduct(dto, categories));
        setProducts((prev) => (replace ? mapped : [...prev, ...mapped.filter((p) => !prev.some((q) => q.id === p.id))]));
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t('errors.failed'));
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [categoryId, categories, t]
  );

  useEffect(() => {
    navigation.setOptions({ title: route.params.name });
    void loadPage(1, true);
    // categories only matter for size grids, which this list does not display
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        contentContainerStyle={{ padding: spacing.md }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loading && !error) void loadPage(page + 1, false);
        }}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => navigation.navigate('Product', { productId: Number(item.id) })} />
        )}
        ListEmptyComponent={
          loading ? (
            <StateMessage loading message={t('common.loading')} />
          ) : error ? (
            <StateMessage message={error} actionLabel={t('mobile.retry')} onAction={() => void loadPage(1, true)} />
          ) : (
            <StateMessage message={t('mobile.productsEmpty')} />
          )
        }
        ListFooterComponent={
          products.length > 0 ? (
            error ? (
              <StateMessage message={error} actionLabel={t('mobile.retry')} onAction={() => void loadPage(page + 1, false)} />
            ) : loading ? (
              <View style={{ padding: spacing.md }}>
                <StateMessage loading />
              </View>
            ) : null
          ) : null
        }
      />
    </Screen>
  );
}
