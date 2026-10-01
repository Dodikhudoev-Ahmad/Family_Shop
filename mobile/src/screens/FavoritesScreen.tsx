import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';
import { ProductCard } from '../components/ProductCard';
import { Screen, StateMessage } from '../components/ui';
import { fetchProduct } from '../lib/api/endpoints';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../lib/types';
import { useCategories } from '../state/CategoriesContext';
import { useFavorites } from '../state/FavoritesContext';
import { spacing } from '../theme/tokens';

export function FavoritesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { favoriteIds } = useFavorites();
  const { categories } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = favoriteIds.join(',');
  useEffect(() => {
    let active = true;
    if (favoriteIds.length === 0) {
      setProducts([]);
      return;
    }
    setLoading(true);
    // A product removed from the shop since it was favourited simply drops out of the list.
    Promise.all(favoriteIds.map((id) => fetchProduct(Number(id)).catch(() => null)))
      .then((dtos) => {
        if (active) setProducts(dtos.filter((d) => d !== null).map((d) => mapProduct(d, categories)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, categories.length]);

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => <ProductCard product={item} onPress={() => navigation.navigate('Product', { productId: Number(item.id) })} />}
        ListEmptyComponent={
          loading ? <StateMessage loading message={t('common.loading')} /> : <StateMessage message={t('favorites.empty')} actionLabel={t('common.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
        }
      />
    </Screen>
  );
}
