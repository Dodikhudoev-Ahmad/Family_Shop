import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AuthForm } from '../components/AuthForm';
import { ConfirmSheet } from '../components/forms';
import { Button, Screen, Segmented } from '../components/ui';
import { LANGUAGE_META, LANGUAGES, setLanguage, type Language } from '../i18n';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing, type ThemeName } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  label: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  muted: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md },
  profile: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { color: c.white, fontFamily: fonts.headingBold, fontSize: fontSizes.xl },
  who: { flex: 1, gap: 2 },
  eyebrow: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  email: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  row: { minHeight: MIN_TOUCH_TARGET + 8, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  rowText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
});

type Confirm = 'logout' | 'logout-all' | null;

/** Account (or the sign-in form for a guest) and the two app-wide preferences: theme and language. */
export function ProfileScreen() {
  const s = useThemedStyles(styles);
  const { colors, theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading, logout, logoutAll } = useAuth();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const language = (LANGUAGES as readonly string[]).includes(i18n.language) ? (i18n.language as Language) : 'ru';

  const initial = user?.name.trim().charAt(0).toUpperCase() || '?';

  const confirmed = () => {
    const action = confirm;
    setConfirm(null);
    if (action === 'logout') void logout();
    else if (action === 'logout-all') void logoutAll().catch(() => undefined);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: spacing.md }]} keyboardShouldPersistTaps="handled">
        {isLoading ? null : user ? (
          <View style={s.section}>
            <View style={s.profile}>
              <View style={s.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text style={s.avatarText}>{initial}</Text>
              </View>
              <View style={s.who}>
                <Text style={s.eyebrow}>{t('account.eyebrow')}</Text>
                <Text style={s.title} numberOfLines={2}>
                  {t('account.greeting', { name: user.name })}
                </Text>
                <Text style={s.email} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('account.myOrders')} onPress={() => navigation.navigate('Orders')} style={s.row}>
              <Text style={s.rowText}>{t('account.myOrders')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <View style={s.section}>
            <Text style={s.title}>{t('mobile.guestTitle')}</Text>
            <Text style={s.muted}>{t('mobile.guestText')}</Text>
            <AuthForm />
          </View>
        )}

        <View style={s.section}>
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
        </View>

        {user ? (
          <View style={s.section}>
            <Button label={t('header.logout')} variant="secondary" onPress={() => setConfirm('logout')} />
            <Button label={t('mobile.logoutAll')} variant="secondary" onPress={() => setConfirm('logout-all')} />
          </View>
        ) : null}
      </ScrollView>

      {confirm ? (
        <ConfirmSheet
          title={t('header.logoutTitle')}
          description={confirm === 'logout' ? t('header.logoutDescription') : t('mobile.logoutAll')}
          confirmLabel={confirm === 'logout' ? t('header.logoutConfirm') : t('mobile.logoutAll')}
          onConfirm={confirmed}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </Screen>
  );
}
