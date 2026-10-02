import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatPrice } from '../lib/mappers';
import { ORDER_STATUS_INFO, type OrderStatusSlug } from '../lib/orders';
import type { ApiOrderStatus } from '../lib/api/types';
import { useCart } from '../state/CartContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';

const fieldStyles = (c: ColorTokens) => ({
  wrap: { gap: 6 },
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
    outlineWidth: 0,
  },
  inputError: { borderColor: c.error },
  inputFocus: { borderColor: c.accent },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  hint: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
});

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
}

/** A labelled input with an inline error. The label doubles as the accessibility label. */
export function TextField({ label, error, hint, onFocus, onBlur, ...input }: TextFieldProps) {
  const s = useThemedStyles(fieldStyles);
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[s.input, focused ? s.inputFocus : null, error ? s.inputError : null]}
      />
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={s.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

interface ConfirmSheetProps {
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replaces the browser's confirm(): a bottom sheet with "Cancel" and the destructive action. Mount it to open it. */
export function ConfirmSheet({ title, description, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  const { t } = useTranslation();
  const s = useThemedStyles(fieldStyles);
  return (
    <BottomSheet
      visible
      title={title}
      onClose={onCancel}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button style={{ flex: 1 }} variant="secondary" label={t('common.cancel')} onPress={onCancel} />
          <Button style={{ flex: 1 }} label={confirmLabel} onPress={onConfirm} />
        </View>
      }
    >
      {description ? <Text style={s.hint}>{description}</Text> : null}
    </BottomSheet>
  );
}

const badgeStyles = (c: ColorTokens) => ({
  badge: { alignSelf: 'flex-start' as const, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  text: { fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  created: { backgroundColor: c.accentSoft, borderColor: 'transparent' },
  processing: { backgroundColor: `${c.warning}26`, borderColor: 'transparent' },
  shipped: { backgroundColor: c.bgSecondary, borderColor: c.accent },
  delivered: { backgroundColor: `${c.success}26`, borderColor: 'transparent' },
  cancelled: { backgroundColor: 'transparent', borderColor: c.border },
  createdText: { color: c.accent },
  processingText: { color: c.warning },
  shippedText: { color: c.accent },
  deliveredText: { color: c.success },
  cancelledText: { color: c.textSecondary },
});

type BadgeStyles = ReturnType<typeof badgeStyles>;
const TEXT_KEY: Record<OrderStatusSlug, 'createdText' | 'processingText' | 'shippedText' | 'deliveredText' | 'cancelledText'> = {
  created: 'createdText', processing: 'processingText', shipped: 'shippedText', delivered: 'deliveredText', cancelled: 'cancelledText',
};

/** Order status pill, in the existing palette (no neon): accent / amber / sage / muted. */
export function StatusBadge({ status }: { status: ApiOrderStatus }) {
  const s = useThemedStyles(badgeStyles);
  const { t } = useTranslation();
  const info = ORDER_STATUS_INFO[status];
  const styles = s as BadgeStyles;
  return (
    <View style={[styles.badge, styles[info.slug]]} accessible accessibilityLabel={t(info.labelKey)}>
      <Text style={[styles.text, styles[TEXT_KEY[info.slug]]]}>{t(info.labelKey)}</Text>
    </View>
  );
}

const promoStyles = (c: ColorTokens) => ({
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0, // a bare input keeps its intrinsic width and would push the button out of a 320pt card
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    color: c.text,
    backgroundColor: c.bg,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    outlineWidth: 0,
  },
  inputError: { borderColor: c.error },
  apply: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  applyOff: { opacity: 0.5 },
  applyText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  applied: { gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.accentSoft },
  appliedRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  appliedText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, flexShrink: 1 },
  remove: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  removeText: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginTop: 4 },
});

/** Promo code field: the discount shown is whatever the SERVER returned for the current subtotal. */
export function PromoCodeInput() {
  const s = useThemedStyles(promoStyles);
  const { t } = useTranslation();
  const { promo, promoError, isApplyingPromo, applyPromoCode, clearPromoCode } = useCart();
  const [code, setCode] = useState('');

  if (promo) {
    return (
      <View style={s.applied}>
        <View style={s.appliedRow}>
          <Text style={s.appliedText}>
            {t('promo.applied', { code: promo.code }).replace(/<\/?strong>/g, '')}
            {promo.discountType === 0 ? ` · −${promo.discountValue}%` : ` · −${formatPrice(promo.discountValue)}`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.remove')} onPress={clearPromoCode} style={s.remove}>
            <Text style={s.removeText}>{t('common.remove')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const disabled = isApplyingPromo || !code.trim();
  const submit = () => {
    if (!disabled) void applyPromoCode(code);
  };

  return (
    <View>
      <View style={s.row}>
        <PromoInput value={code} onChange={setCode} onSubmit={submit} editable={!isApplyingPromo} hasError={!!promoError} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('promo.apply')} accessibilityState={{ disabled }} disabled={disabled} onPress={submit} style={[s.apply, disabled && s.applyOff]}>
          <Text style={s.applyText}>{isApplyingPromo ? t('promo.checking') : t('promo.apply')}</Text>
        </Pressable>
      </View>
      {promoError ? (
        <Text style={s.error} accessibilityRole="alert">
          {promoError}
        </Text>
      ) : null}
    </View>
  );
}

function PromoInput({ value, onChange, onSubmit, editable, hasError }: { value: string; onChange: (v: string) => void; onSubmit: () => void; editable: boolean; hasError: boolean }) {
  const s = useThemedStyles(promoStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      editable={editable}
      maxLength={50}
      autoCapitalize="characters"
      autoCorrect={false}
      placeholder={t('promo.label')}
      placeholderTextColor={colors.textSecondary}
      accessibilityLabel={t('promo.label')}
      style={[s.input, hasError ? s.inputError : null]}
    />
  );
}
