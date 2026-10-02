import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { ApiError } from '../lib/api/errors';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { BottomSheet } from './BottomSheet';
import { TextField } from './forms';
import { Button } from './ui';

const styles = (c: ColorTokens) => ({
  text: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 22 },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  // Stacked: the destructive label is long ("Удалить навсегда") and must stay on one line at 320pt.
  footer: { gap: spacing.sm },
});

/** What to show for a refused deletion: wrong password, an administrator account, or an order still in progress. */
export function deleteErrorKey(
  error: unknown
): { key: 'mobile.wrongPassword' | 'mobile.adminCannotDelete' | 'mobile.activeOrdersCannotDelete' } | { raw: string } {
  if (error instanceof ApiError) {
    // 409 + the code "active_orders": an order is still in progress, the account has to stay for now.
    if (error.status === 409 && error.message.includes('active_orders')) return { key: 'mobile.activeOrdersCannotDelete' };
    if (error.status === 400 && /incorrect password/i.test(error.message)) return { key: 'mobile.wrongPassword' };
    if (error.status === 403) return { key: 'mobile.adminCannotDelete' };
    return { raw: error.message };
  }
  return { raw: error instanceof Error ? error.message : '' };
}

interface DeleteAccountFlowProps {
  onClose: () => void;
  /** Called once the account is gone (the user is already signed out by then). */
  onDeleted: () => void;
}

/**
 * Two deliberate steps before anything is destroyed: first what will happen (and what stays), then the current
 * password. A refusal (wrong password) is shown in place and nothing changes.
 */
export function DeleteAccountFlow({ onClose, onDeleted }: DeleteAccountFlowProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const { deleteAccount } = useAuth();
  const [step, setStep] = useState<'warn' | 'password'>('warn');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    if (!password) {
      setError(t('auth.passwordRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      setPassword('');
      onDeleted();
    } catch (e: unknown) {
      const mapped = deleteErrorKey(e);
      setError('key' in mapped ? t(mapped.key) : mapped.raw || t('errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'warn') {
    return (
      <BottomSheet
        visible
        title={t('mobile.deleteAccountTitle')}
        onClose={onClose}
        footer={
          <View style={s.footer}>
            <Button variant="danger" label={t('mobile.deleteAccountContinue')} onPress={() => setStep('password')} />
            <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
          </View>
        }
      >
        <Text style={s.text}>{t('mobile.deleteAccountText')}</Text>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible
      title={t('mobile.deleteAccountFinalTitle')}
      onClose={onClose}
      footer={
        <View style={s.footer}>
          <Button variant="danger" label={t('mobile.deleteAccountConfirm')} onPress={() => void confirm()} loading={busy} />
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} disabled={busy} />
        </View>
      }
    >
      <Text style={s.text}>{t('mobile.deleteAccountFinalText')}</Text>
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void confirm()}
        maxLength={1024}
      />
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
