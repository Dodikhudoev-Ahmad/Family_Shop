import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PromoCodeInput, TextField } from '../components/forms';
import { Button, Screen, StateMessage } from '../components/ui';
import { useFieldError } from '../i18n/labels';
import { createOrder } from '../lib/api/endpoints';
import type { ApiDeliveryMethod } from '../lib/api/types';
import { formatPrice } from '../lib/mappers';
import { createIdempotencyKeyHolder } from '../lib/idempotency';
import { orderNumber } from '../lib/orders';
import { outOfStockInfo, outOfStockMessage, sizeUnavailableInfo, sizeUnavailableMessage } from '../lib/orderErrors';
import { formatPhoneInput, LIMITS, validateAddress, validateOrderLines, validatePhone } from '../lib/validation';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

type Method = 'courier' | 'pickup';
const METHOD_TO_API: Record<Method, ApiDeliveryMethod> = { courier: 0, pickup: 1 };

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  label: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  methods: { gap: spacing.sm },
  method: { minHeight: MIN_TOUCH_TARGET + 12, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, justifyContent: 'center' as const },
  methodOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  methodTitle: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  methodDesc: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  summary: { backgroundColor: c.bgSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.md },
  rowText: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, flexShrink: 1 },
  discount: { color: c.accent },
  total: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
  note: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  done: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl, gap: spacing.md },
  doneTitle: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl, textAlign: 'center' as const },
  doneNumber: { color: c.accent, fontFamily: fonts.headingBold, fontSize: fontSizes.display },
  doneText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, textAlign: 'center' as const },
  doneActions: { alignSelf: 'stretch' as const, gap: spacing.sm, marginTop: spacing.md },
});

/**
 * Checkout. Signed-in users only (as on the website). The order body carries product ids, sizes, quantities,
 * the contact data and the promo CODE - never a price or a discount: the server prices the order.
 */
export function CheckoutScreen() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useFieldError();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading } = useAuth();
  const { lines, totalPrice, finalTotal, promo, clear } = useCart();
  const { reload: reloadProducts } = useProducts();

  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<Method>('courier');
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState<{ phone?: boolean; address?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: if the shortage empties the cart, the empty state still explains what happened.
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Checkout opens with its own idempotency key; it changes with the request body and after a placed order.
  const idempotencyKeys = useRef(createIdempotencyKeyHolder());

  // Leaving the confirmation resets the cart tab to its (empty) cart, so it is never shown again later.
  const leave = (go: () => void) => {
    navigation.popToTop();
    go();
  };

  if (isLoading) {
    return (
      <Screen>
        <StateMessage loading message={t('common.loading')} />
      </Screen>
    );
  }

  if (placed) {
    return (
      <Screen>
        <View style={s.done} accessibilityRole="alert">
          <Ionicons name="checkmark-circle" size={72} color={colors.accent} />
          <Text style={s.doneTitle}>{t('checkout.successTitle')}</Text>
          <Text style={s.doneText}>{t('checkout.orderNumber')}</Text>
          <Text style={s.doneNumber} accessibilityLabel={`${t('checkout.orderNumber')} ${placed}`}>
            {placed}
          </Text>
          <Text style={s.doneText}>{t('checkout.successText')}</Text>
          <View style={s.doneActions}>
            <Button label={t('mobile.toOrders')} onPress={() => leave(() => navigation.navigate('ProfileTab', { screen: 'Orders' }))} />
            <Button variant="secondary" label={t('common.toCatalog')} onPress={() => leave(() => navigation.navigate('CatalogTab'))} />
          </View>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <StateMessage message={t('mobile.signInToCheckout')} actionLabel={t('header.login')} onAction={() => navigation.navigate('Auth', { next: 'Checkout' })} />
      </Screen>
    );
  }

  if (lines.length === 0) {
    return (
      <Screen>
        <StateMessage message={stockNotice ?? t('checkout.empty')} actionLabel={t('checkout.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
      </Screen>
    );
  }

  const phoneError = validatePhone(phone);
  const addressError = validateAddress(address, method === 'courier');
  const orderLines = lines.map((l) => ({ productId: l.productId, quantity: l.quantity, size: l.size }));
  const linesError = validateOrderLines(orderLines);

  const submit = async () => {
    if (inFlight.current) return; // a double tap must not place two orders
    setTouched({ phone: true, address: true });
    setError(null);
    setStockNotice(null);
    if (phoneError || addressError || linesError) {
      setError(text(linesError));
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const request = {
        items: orderLines.map((l) => ({ productId: Number(l.productId), quantity: l.quantity, size: l.size })),
        contactPhone: phone,
        deliveryMethod: METHOD_TO_API[method],
        address: method === 'courier' ? address.trim() : undefined,
        promoCode: promo?.code,
      };
      const order = await createOrder(request, idempotencyKeys.current.keyFor(JSON.stringify(request)));
      idempotencyKeys.current.reset();
      clear();
      setPlaced(orderNumber(order.id));
      // Nothing to go back to: the cart is empty now.
      navigation.setOptions({ headerShown: false, gestureEnabled: false });
    } catch (e: unknown) {
      const shortage = outOfStockInfo(e);
      if (shortage) {
        // No order was created and the cart is untouched. Re-reading the catalogue lets the cart reconcile itself
        // with the real stock (quantities trimmed, sold-out lines dropped with the usual notice on the cart screen).
        const message = outOfStockMessage(shortage, t);
        setError(message);
        setStockNotice(message);
        void reloadProducts();
      } else {
        const sizeProblem = sizeUnavailableInfo(e);
        if (sizeProblem) {
          // The size isn't sold (any more): no order, the cart stays; the reloaded catalogue lets the cart reconcile
          // itself (that line is dropped with the usual notice on the cart screen).
          const message = sizeUnavailableMessage(sizeProblem, t);
          setError(message);
          setStockNotice(message);
          void reloadProducts();
        } else {
          setError(e instanceof Error && e.message ? e.message : t('checkout.failed'));
        }
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('checkout.phone')}
          value={phone}
          onChangeText={(value) => setPhone(formatPhoneInput(value))}
          onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
          error={touched.phone ? text(phoneError) : null}
          placeholder="+7 (700) 000-00-00"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={LIMITS.phone}
        />

        <View style={{ gap: spacing.sm }}>
          <Text style={s.label}>{t('checkout.method')}</Text>
          <View style={s.methods} accessibilityRole="radiogroup">
            {(['courier', 'pickup'] as Method[]).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
                accessibilityLabel={m === 'courier' ? t('checkout.courier') : t('checkout.pickup')}
                onPress={() => setMethod(m)}
                style={[s.method, method === m && s.methodOn]}
              >
                <Text style={s.methodTitle}>{m === 'courier' ? t('checkout.courier') : t('checkout.pickup')}</Text>
                <Text style={s.methodDesc}>{m === 'courier' ? t('checkout.courierDesc') : t('checkout.pickupDesc')}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {method === 'courier' ? (
          <TextField
            label={t('checkout.address')}
            value={address}
            onChangeText={setAddress}
            onBlur={() => setTouched((p) => ({ ...p, address: true }))}
            error={touched.address ? text(addressError) : null}
            placeholder={t('checkout.addressPlaceholder')}
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            maxLength={LIMITS.address}
          />
        ) : null}

        <View style={s.summary}>
          <Text style={s.label}>{t('checkout.items')}</Text>
          {lines.map((line) => (
            <View key={line.key} style={s.row}>
              <Text style={s.rowText} numberOfLines={2}>
                {line.name}
                {line.size ? ` · ${line.size}` : ''} × {line.quantity}
              </Text>
              <Text style={s.rowText}>{formatPrice(line.price * line.quantity)}</Text>
            </View>
          ))}
          <PromoCodeInput />
          {promo ? (
            <View style={s.row}>
              <Text style={[s.rowText, s.discount]}>{t('cart.promoDiscount')}</Text>
              <Text style={[s.rowText, s.discount]}>−{formatPrice(totalPrice - finalTotal)}</Text>
            </View>
          ) : null}
          <View style={s.row}>
            <Text style={s.rowText}>{t('mobile.estimatedTotal')}</Text>
            <Text style={s.total}>{formatPrice(finalTotal)}</Text>
          </View>
          <Text style={s.note}>{t('mobile.priceNote')}</Text>
          <Text style={s.rowText}>
            {t('checkout.payment')}: {t('checkout.paymentValue')}
          </Text>
        </View>

        {error ? (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={submitting ? t('checkout.submitting') : t('checkout.confirm')} onPress={() => void submit()} loading={submitting} />
      </ScrollView>
    </Screen>
  );
}
