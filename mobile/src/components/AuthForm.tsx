import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useFieldError } from '../i18n/labels';
import {
  authErrorKey,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
  type AuthMode,
} from '../lib/validation';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { TextField } from './forms';
import { Button, Segmented } from './ui';

const styles = (c: ColorTokens) => ({
  form: { gap: spacing.md },
  notice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: c.accentSoft },
  noticeText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
});

type Field = 'name' | 'email' | 'password';

/**
 * Sign in / create account. The same rules as the server are checked first; whatever the server then
 * says is shown, except that a failed sign-in is always "wrong email or password" and a failed
 * registration never reveals whether the e-mail already has an account.
 */
export function AuthForm({ intro }: { intro?: string }) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const text = useFieldError();
  const { login, register, sessionEnded } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = {
    name: mode === 'register' ? validateName(name) : null,
    email: validateEmail(email),
    password: mode === 'register' ? validateNewPassword(password, email) : validateLoginPassword(password),
  };
  const valid = !errors.name && !errors.email && !errors.password;
  const touch = (field: Field) => setTouched((prev) => ({ ...prev, [field]: true }));
  const shown = (field: Field) => (touched[field] ? text(errors[field]) : null);

  const submit = async () => {
    setTouched({ name: true, email: true, password: true });
    setServerError(null);
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      setPassword(''); // never keep the password around once it has been used
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('auth.generic');
      const mapped = authErrorKey(mode, message);
      setServerError('key' in mapped ? t(mapped.key as 'mobile.invalidCredentials') : mapped.raw);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.form}>
      {sessionEnded ? (
        <View style={s.notice} accessibilityRole="alert">
          <Text style={s.noticeText}>{t('mobile.sessionEnded')}</Text>
        </View>
      ) : intro ? (
        <View style={s.notice}>
          <Text style={s.noticeText}>{intro}</Text>
        </View>
      ) : null}

      <Segmented
        value={mode}
        onChange={(next) => {
          setMode(next);
          setServerError(null);
          setTouched({});
        }}
        options={[
          { value: 'login', label: t('auth.tabLogin') },
          { value: 'register', label: t('auth.tabRegister') },
        ]}
      />

      {mode === 'register' ? (
        <TextField
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          onBlur={() => touch('name')}
          error={shown('name')}
          autoComplete="name"
          textContentType="name"
          maxLength={100}
        />
      ) : null}
      <TextField
        label={t('mobile.email')}
        value={email}
        onChangeText={setEmail}
        onBlur={() => touch('email')}
        error={shown('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={256}
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        onBlur={() => touch('password')}
        error={shown('password')}
        hint={mode === 'register' ? t('auth.hint', { n: 8 }) : undefined}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        textContentType={mode === 'login' ? 'password' : 'newPassword'}
        onSubmitEditing={() => void submit()}
      />

      {serverError ? (
        <Text style={s.error} accessibilityRole="alert">
          {serverError}
        </Text>
      ) : null}

      <Button label={busy ? t('auth.wait') : mode === 'login' ? t('auth.tabLogin') : t('auth.create')} onPress={() => void submit()} loading={busy} />
    </View>
  );
}
