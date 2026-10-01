import { useNavigation, type ParamListBase, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, Text, View } from 'react-native';
import { StatusBadge } from '../components/forms';
import { SkeletonBlock } from '../components/Skeleton';
import { Screen, StateMessage } from '../components/ui';
import { formatPrice } from '../lib/mappers';
import { formatOrderDate, orderNumber } from '../lib/orders';
import type { ProfileStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useOrders } from '../state/useOrders';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  head: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.sm },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl, flexShrink: 1 },
  date: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.bgSecondary },
  text: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md },
  strong: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: c.bg },
  rowInfo: { flex: 1, gap: 2 },
  small: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  discount: { color: c.accent, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  totalRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
  total: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
});

/** One of my orders: status, contact, delivery, lines, promo discount and the total the server charged. */
export function OrderDetailScreen({ route }: { route: RouteProp<ProfileStackParamList, 'OrderDetail'> }) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading: authLoading } = useAuth();
  const { orders, error, loading, reload } = useOrders();
  const { orderId } = route.params;

  useEffect(() => {
    if (!authLoading && !user) navigation.popToTop();
  }, [authLoading, user, navigation]);

  if (loading && orders === null) {
    return (
      <Screen>
        <View style={{ padding: spacing.md, gap: spacing.md }}>
          <SkeletonBlock height={32} width="60%" />
          <SkeletonBlock height={90} style={{ borderRadius: radius.md }} />
          <SkeletonBlock height={160} style={{ borderRadius: radius.md }} />
        </View>
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

  const order = orders?.find((o) => o.id === orderId);
  if (!order) {
    return (
      <Screen>
        <StateMessage message={t('orders.notFound')} actionLabel={t('account.myOrders')} onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.head}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={s.title}>{t('orders.title', { id: order.id })}</Text>
            <Text style={s.date}>{formatOrderDate(order.createdAt)}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>

        <View style={s.card}>
          <Text style={s.strong}>{[order.contactName, order.contactPhone].filter(Boolean).join(', ')}</Text>
          <Text style={s.text}>{order.deliveryMethod === 0 ? [order.city, order.address].filter(Boolean).join(', ') : t('checkout.pickupAt')}</Text>
          <Text style={s.small}>{t('checkout.paymentValue')}</Text>
        </View>

        <View style={s.card}>
          {order.items.map((item, i) => (
            <View key={`${item.productId}-${i}`} style={s.row}>
              {item.productImage ? <Image source={{ uri: item.productImage }} style={s.thumb} accessibilityIgnoresInvertColors /> : <View style={s.thumb} />}
              <View style={s.rowInfo}>
                <Text style={s.text} numberOfLines={2}>
                  {item.productName}
                </Text>
                <Text style={s.small}>
                  {item.size ? `${item.size} · ` : ''}
                  {t('checkout.qty', { count: item.quantity })}
                </Text>
              </View>
              <Text style={s.strong}>{formatPrice(item.price * item.quantity)}</Text>
            </View>
          ))}
          {order.promoCode ? (
            <View style={s.row}>
              <Text style={[s.discount, { flex: 1 }]}>{t('orders.promo', { code: order.promoCode })}</Text>
              <Text style={s.discount}>−{formatPrice(order.discountAmount)}</Text>
            </View>
          ) : null}
          <View style={s.totalRow}>
            <Text style={s.strong}>{t('common.total')}</Text>
            <Text style={s.total}>{formatPrice(order.totalPrice)}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
