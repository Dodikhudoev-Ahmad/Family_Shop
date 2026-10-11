import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { requestPasswordReset } from '../lib/api/endpoints';
import { useFieldError } from '../i18n/labels';
import { validateEmail } from '../lib/validation';
import { fontSizes, fonts, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { TextField } from './forms';
import { Button } from './ui';

const styles = (c: ColorTokens) => ({
  text: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 22 },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  footer: { gap: spacing.sm },
});

/**
 * "Forgot password": asks for the address and always ends with the same neutral confirmation - the app never learns,
 * and never says, whether the address has an account. The link in the letter opens the site, where the new password is set.
 */
export function ForgotPasswordFlow({ initialEmail = '', onClose }: { initialEmail?: string; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { t, i18n } = useTranslation();
  const text = useFieldError();
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validateEmail(email);

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (validation || busy) return;
    setBusy(true);
    try {
      await requestPasswordReset(email.trim(), i18n.language);
      setSent(true);
    } catch (e: unknown) {
      // Only transport-level failures reach here (offline, rate limit): the answer itself never depends on the address.
      setError(e instanceof Error && e.message ? e.message : t('auth.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible
      title={t('mobile.forgotTitle')}
      onClose={onClose}
      footer={
        <View style={s.footer}>
          {sent ? null : <Button label={t('mobile.forgotSend')} onPress={() => void submit()} loading={busy} />}
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} disabled={busy} />
        </View>
      }
    >
      {sent ? (
        <Text style={s.text} accessibilityRole="alert">
          {t('mobile.forgotSent')}
        </Text>
      ) : (
        <>
          <Text style={s.text}>{t('mobile.forgotText')}</Text>
          <TextField
            label={t('mobile.email')}
            value={email}
            onChangeText={setEmail}
            onBlur={() => setTouched(true)}
            error={touched ? text(validation) : null}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={256}
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <Text style={s.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}
