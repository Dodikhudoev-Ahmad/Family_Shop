import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Screen, Segmented, StateMessage } from '../components/ui';
import { createOrder } from '../lib/api/endpoints';
import type { ApiDeliveryMethod } from '../lib/api/types';
import { formatPrice } from '../lib/mappers';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.md },
  label: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  input: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    color: c.text,
    backgroundColor: c.bg,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
  },
  summary: { backgroundColor: c.bgSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.md },
  rowText: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, flexShrink: 1 },
  total: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  success: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl, textAlign: 'center' as const },
});

export function CheckoutScreen() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading } = useAuth();
  const { lines, totalPrice, clear } = useCart();

  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'courier' | 'pickup'>('courier');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  if (isLoading) return <Screen><StateMessage loading message={t('common.loading')} /></Screen>;

  if (orderNumber) {
    return (
      <Screen>
        <StateMessage message={`${t('checkout.successTitle')}\n${orderNumber}`} actionLabel={t('common.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <StateMessage message={t('mobile.signInToCheckout')} actionLabel={t('header.login')} onAction={() => navigation.navigate('ProfileTab')} />
      </Screen>
    );
  }

  if (lines.length === 0) {
    return (
      <Screen>
        <StateMessage message={t('checkout.empty')} actionLabel={t('checkout.toCatalog')} onAction={() => navigation.navigate('CatalogTab')} />
      </Screen>
    );
  }

  const submit = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) return setError(t('checkout.phoneRequired'));
    if (method === 'courier' && !address.trim()) return setError(t('checkout.addressRequired'));

    setSubmitting(true);
    setError(null);
    try {
      const deliveryMethod: ApiDeliveryMethod = method === 'courier' ? 0 : 1;
      const order = await createOrder({
        items: lines.map((l) => ({ productId: Number(l.productId), quantity: l.quantity, size: l.size })),
        contactPhone: trimmedPhone,
        deliveryMethod,
        address: method === 'courier' ? address.trim() : undefined,
      });
      clear();
      setOrderNumber(`FS-${order.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('checkout.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t('checkout.phone')}</Text>
        <TextInput
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+7 (700) 000-00-00"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          accessibilityLabel={t('checkout.phone')}
        />

        <Text style={s.label}>{t('checkout.method')}</Text>
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: 'courier', label: t('checkout.courier') },
            { value: 'pickup', label: t('checkout.pickup') },
          ]}
        />

        {method === 'courier' ? (
          <>
            <Text style={s.label}>{t('checkout.address')}</Text>
            <TextInput
              style={s.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('checkout.addressPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoComplete="street-address"
              textContentType="fullStreetAddress"
              accessibilityLabel={t('checkout.address')}
            />
          </>
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
          <View style={s.row}>
            <Text style={s.rowText}>{t('common.total')}</Text>
            <Text style={s.total}>{formatPrice(totalPrice)}</Text>
          </View>
          <Text style={s.rowText}>{t('checkout.paymentValue')}</Text>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
        <Button label={submitting ? t('checkout.submitting') : t('checkout.confirm')} onPress={() => void submit()} loading={submitting} />
      </ScrollView>
    </Screen>
  );
}
