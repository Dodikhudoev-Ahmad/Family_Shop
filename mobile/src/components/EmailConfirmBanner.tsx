import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resendEmailConfirmation } from '../lib/api/endpoints';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { Button } from './ui';

const styles = (c: ColorTokens) => ({
  box: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: c.accentSoft },
  text: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  muted: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  actions: { gap: spacing.sm },
});

/** A soft reminder to confirm the address. Nothing is blocked: orders work without it. */
export function EmailConfirmBanner({ email }: { email: string }) {
  const s = useThemedStyles(styles);
  const { t, i18n } = useTranslation();
  const { reloadUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await resendEmailConfirmation(email, i18n.language);
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : t('auth.generic'));
    } finally {
      setSending(false);
    }
  };

  // The link is opened in the phone's browser, not in the app; this re-reads the account once the person is back.
  const check = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await reloadUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={s.box} accessibilityRole="summary">
      <Text style={s.text}>{t('mobile.emailBannerText', { email })}</Text>
      {sent ? <Text style={s.muted}>{t('mobile.emailBannerSent')}</Text> : null}
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={s.actions}>
        {sent ? null : <Button variant="secondary" label={t('mobile.emailBannerResend')} onPress={() => void resend()} loading={sending} />}
        <Button variant="secondary" label={t('mobile.emailBannerCheck')} onPress={() => void check()} loading={checking} />
      </View>
    </View>
  );
}
