import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { ConfirmSheet, PromoCodeInput } from '../components/forms';
import { Button, Screen, StateMessage } from '../components/ui';
import { formatPrice } from '../lib/mappers';
import { LIMITS } from '../lib/validation';
import { useCart } from '../state/CartContext';
import { remainingStock, type CartLine } from '../state/cartLogic';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  notice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: c.accentSoft },
  noticeText: { flex: 1, color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  noticeBtn: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const, paddingHorizontal: spacing.sm },
  noticeBtnText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  line: { flexDirection: 'row' as const, gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  thumb: { width: 72, height: 96, borderRadius: radius.sm, backgroundColor: c.bgSecondary },
  info: { flex: 1, gap: 4 },
  name: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  meta: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.lg },
  controls: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: spacing.xs },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, borderWidth: 1, borderColor: c.border, borderRadius: radius.md },
  stepBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  stepOff: { opacity: 0.35 },
  stepText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xl },
  qty: { minWidth: 28, textAlign: 'center' as const, color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  remove: { marginLeft: 'auto' as const, width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  footer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg },
  sumRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.md },
  sumLabel: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, flexShrink: 1 },
  sumValue: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  discount: { color: c.accent },
  totalLabel: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md, flexShrink: 1 },
  total: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
  note: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
});

export function CartScreen() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { lines, totalPrice, finalTotal, promo, setQuantity, removeItem, removedNotice, dismissRemovedNotice } = useCart();
  const [pendingRemove, setPendingRemove] = useState<CartLine | null>(null);

  const header =
    removedNotice > 0 ? (
      <View style={s.notice} accessibilityRole="alert">
        <Text style={s.noticeText}>{t('mobile.cartRemovedNotice')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('mobile.dismiss')} onPress={dismissRemovedNotice} style={s.noticeBtn}>
          <Text style={s.noticeBtnText}>{t('mobile.dismiss')}</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <Screen>
      <FlatList
        data={lines}
        keyExtractor={(line) => line.key}
        contentContainerStyle={s.list}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <StateMessage message={t('cart.empty')} actionLabel={t('common.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
        }
        renderItem={({ item }) => {
          // The stock is shared by every size of the product, so the room left comes from ALL its lines.
          const canAdd = remainingStock(lines, item.productId, item.stock) > 0 && item.quantity < LIMITS.lineQuantity;
          return (
            <View style={s.line}>
              {item.image ? <Image source={{ uri: item.image }} style={s.thumb} accessibilityIgnoresInvertColors /> : <View style={s.thumb} />}
              <View style={s.info}>
                <Text style={s.name} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.size ? <Text style={s.meta}>{t('cart.size', { size: item.size })}</Text> : null}
                <Text style={s.price}>{formatPrice(item.price * item.quantity)}</Text>
                <View style={s.controls}>
                  <View style={s.stepper}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('cart.decrease')}
                      onPress={() => (item.quantity <= 1 ? setPendingRemove(item) : setQuantity(item.key, item.quantity - 1))}
                      style={s.stepBtn}
                    >
                      <Text style={s.stepText}>−</Text>
                    </Pressable>
                    <Text style={s.qty}>{item.quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('cart.increase')}
                      accessibilityState={{ disabled: !canAdd }}
                      disabled={!canAdd}
                      onPress={() => setQuantity(item.key, item.quantity + 1)}
                      style={[s.stepBtn, !canAdd && s.stepOff]}
                    >
                      <Text style={s.stepText}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('cart.removeItem')} onPress={() => setPendingRemove(item)} style={s.remove}>
                    <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      {lines.length > 0 ? (
        <View style={s.footer}>
          <PromoCodeInput />
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>{t('cart.sum')}</Text>
            <Text style={s.sumValue}>{formatPrice(totalPrice)}</Text>
          </View>
          {promo ? (
            <View style={s.sumRow}>
              <Text style={[s.sumLabel, s.discount]}>{t('cart.promoDiscount')}</Text>
              <Text style={[s.sumValue, s.discount]}>−{formatPrice(totalPrice - finalTotal)}</Text>
            </View>
          ) : null}
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>{t('cart.delivery')}</Text>
            <Text style={s.sumValue}>{t('cart.deliveryTbd')}</Text>
          </View>
          <View style={s.sumRow}>
            <Text style={s.totalLabel}>{t('mobile.estimatedTotal')}</Text>
            <Text style={s.total}>{formatPrice(finalTotal)}</Text>
          </View>
          <Button label={t('cart.checkout')} onPress={() => navigation.navigate('Checkout')} />
          <Text style={s.note}>
            {t('cart.note')} {t('mobile.priceNote')}
          </Text>
        </View>
      ) : null}

      {pendingRemove ? (
        <ConfirmSheet
          title={t('cart.removeTitle', { name: pendingRemove.name })}
          description={pendingRemove.size ? t('cart.removeDescSize', { size: pendingRemove.size }) : t('cart.removeDesc')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            removeItem(pendingRemove.key);
            setPendingRemove(null);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      ) : null}
    </Screen>
  );
}
