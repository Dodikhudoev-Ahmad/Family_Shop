import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { StatusBadge } from '../components/forms';
import { SkeletonBlock } from '../components/Skeleton';
import { Screen, StateMessage } from '../components/ui';
import { formatPrice } from '../lib/mappers';
import { formatOrderDate, orderNumber } from '../lib/orders';
import { useAuth } from '../state/AuthContext';
import { useOrders } from '../state/useOrders';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: { minHeight: MIN_TOUCH_TARGET, gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.sm },
  id: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  meta: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  date: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  total: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  thumbs: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  thumb: { width: 40, height: 52, borderRadius: radius.sm, backgroundColor: c.bgSecondary },
  more: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginLeft: spacing.xs },
});

function OrdersSkeleton() {
  return (
    <View style={{ padding: spacing.md, gap: spacing.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} height={110} style={{ borderRadius: radius.md }} />
      ))}
    </View>
  );
}

/** "My orders": only the signed-in user's, newest first as the server sends them. */
export function OrdersScreen() {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading: authLoading } = useAuth();
  const { orders, error, loading, reload } = useOrders();

  // The session ended while this screen was open: back to the root of the tab, which shows the sign-in form.
  useEffect(() => {
    if (!authLoading && !user) navigation.popToTop();
  }, [authLoading, user, navigation]);

  if (loading && orders === null) {
    return (
      <Screen>
        <OrdersSkeleton />
      </Screen>
    );
  }
  if (error && orders === null) {
    return (
      <Screen>
        <StateMessage message={error} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={orders ?? []}
        keyExtractor={(order) => String(order.id)}
        contentContainerStyle={s.list}
        refreshing={loading}
        onRefresh={() => void reload()}
        ListEmptyComponent={
          <View>
            <StateMessage message={`${t('account.emptyTitle')}\n${t('account.emptyText')}`} actionLabel={t('account.shop')} onAction={() => navigation.getParent()?.navigate('CatalogTab')} />
          </View>
        }
        ListHeaderComponent={error ? <StateMessage message={error} actionLabel={t('mobile.retry')} onAction={() => void reload()} /> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={orderNumber(item.id)}
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            style={s.card}
          >
            <View style={s.top}>
              <Text style={s.id}>{orderNumber(item.id)}</Text>
              <StatusBadge status={item.status} />
            </View>
            <View style={s.meta}>
              <Text style={s.date}>{formatOrderDate(item.createdAt)}</Text>
              <Text style={s.total}>{formatPrice(item.totalPrice)}</Text>
            </View>
            <View style={s.thumbs}>
              {item.items.slice(0, 5).map((line, i) =>
                line.productImage ? (
                  <Image key={`${line.productId}-${i}`} source={{ uri: line.productImage }} style={s.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View key={`${line.productId}-${i}`} style={s.thumb} />
                )
              )}
              {item.items.length > 5 ? <Text style={s.more}>+{item.items.length - 5}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
