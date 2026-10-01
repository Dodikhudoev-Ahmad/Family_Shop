import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { Button, Screen, StateMessage } from '../components/ui';
import { formatPrice } from '../lib/mappers';
import { useCart } from '../state/CartContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  line: { flexDirection: 'row' as const, gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  thumb: { width: 72, height: 96, borderRadius: radius.sm, backgroundColor: c.bgSecondary },
  info: { flex: 1, gap: 4 },
  name: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  meta: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  price: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.lg },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs },
  stepBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xl },
  qty: { minWidth: 28, textAlign: 'center' as const, color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  remove: { marginLeft: 'auto' as const, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const },
  removeText: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  footer: { padding: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg },
  totalRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  totalLabel: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  total: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
});

export function CartScreen() {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { lines, totalPrice, setQuantity, removeItem } = useCart();

  return (
    <Screen>
      <FlatList
        data={lines}
        keyExtractor={(line) => line.key}
        contentContainerStyle={s.list}
        ListEmptyComponent={<StateMessage message={t('cart.empty')} actionLabel={t('common.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />}
        renderItem={({ item }) => (
          <View style={s.line}>
            {item.image ? <Image source={{ uri: item.image }} style={s.thumb} accessibilityIgnoresInvertColors /> : <View style={s.thumb} />}
            <View style={s.info}>
              <Text style={s.name} numberOfLines={2}>
                {item.name}
              </Text>
              {item.size ? <Text style={s.meta}>{t('cart.size', { size: item.size })}</Text> : null}
              <Text style={s.price}>{formatPrice(item.price * item.quantity)}</Text>
              <View style={s.stepper}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('cart.decrease')} onPress={() => setQuantity(item.key, item.quantity - 1)} style={s.stepBtn}>
                  <Text style={s.stepText}>−</Text>
                </Pressable>
                <Text style={s.qty}>{item.quantity}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.increase')}
                  accessibilityState={{ disabled: item.quantity >= item.stock }}
                  onPress={() => setQuantity(item.key, item.quantity + 1)}
                  style={s.stepBtn}
                >
                  <Text style={s.stepText}>+</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('cart.removeItem')} onPress={() => removeItem(item.key)} style={s.remove}>
                  <Text style={s.removeText}>{t('common.delete')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
      {lines.length > 0 ? (
        <View style={s.footer}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{t('common.total')}</Text>
            <Text style={s.total}>{formatPrice(totalPrice)}</Text>
          </View>
          <Button label={t('cart.checkout')} onPress={() => navigation.navigate('Checkout')} />
        </View>
      ) : null}
    </Screen>
  );
}
