import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Screen, Segmented } from '../components/ui';
import { LANGUAGE_META, LANGUAGES, setLanguage, type Language } from '../i18n';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing, type ThemeName } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  label: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  body: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md },
  muted: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
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
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
});

function AccountSection() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, isLoading, login, register, logout, logoutAll } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return null;

  if (user) {
    return (
      <View style={s.section}>
        <Text style={s.title}>{t('account.greeting', { name: user.name })}</Text>
        <Text style={s.muted}>{user.email}</Text>
        <Button label={t('header.logout')} variant="secondary" onPress={() => void logout()} />
        <Button label={t('mobile.logoutAll')} variant="secondary" onPress={() => void logoutAll()} />
      </View>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      setPassword(''); // never keep the password around once it has been used
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.section}>
      <Segmented
        value={mode}
        onChange={(value) => {
          setMode(value);
          setError(null);
        }}
        options={[
          { value: 'login', label: t('auth.tabLogin') },
          { value: 'register', label: t('auth.tabRegister') },
        ]}
      />
      {mode === 'register' ? (
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder={t('auth.name')}
          placeholderTextColor={colors.textSecondary}
          autoComplete="name"
          textContentType="name"
          accessibilityLabel={t('auth.name')}
        />
      ) : null}
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        accessibilityLabel="Email"
      />
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        textContentType={mode === 'login' ? 'password' : 'newPassword'}
        accessibilityLabel={t('auth.password')}
      />
      {mode === 'register' ? <Text style={s.muted}>{t('auth.hint', { n: 8 })}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label={busy ? t('auth.wait') : mode === 'login' ? t('auth.tabLogin') : t('auth.create')}
        onPress={() => void submit()}
        loading={busy}
        disabled={!email.trim() || !password || (mode === 'register' && !name.trim())}
      />
    </View>
  );
}

/** Account + the two app-wide preferences: theme and language. */
export function ProfileScreen() {
  const s = useThemedStyles(styles);
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const language = (LANGUAGES as readonly string[]).includes(i18n.language) ? (i18n.language as Language) : 'ru';

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <AccountSection />

        <Text style={s.title}>{t('mobile.settings')}</Text>
        <Text style={s.label}>{t('mobile.theme')}</Text>
        <Segmented<ThemeName>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('mobile.themeLight') },
            { value: 'dark', label: t('mobile.themeDark') },
          ]}
        />

        <Text style={s.label}>{t('language.label')}</Text>
        <Segmented<Language>
          value={language}
          onChange={(next) => void setLanguage(next)}
          options={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_META[code].name }))}
        />
      </ScrollView>
    </Screen>
  );
}
