import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLabels } from '../i18n/labels';
import { isLanguage, LANGUAGE_META, LANGUAGES, setLanguage, type Language } from '../i18n';
import type { Category } from '../lib/types';
import type { AuthUser } from '../lib/api/types';
import { fontSizes, fonts, MIN_TOUCH_TARGET, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { Segmented } from './ui';

const styles = (c: ColorTokens) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingLeft: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  close: { width: MIN_TOUCH_TARGET + 8, height: MIN_TOUCH_TARGET + 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  closeText: { color: c.text, fontSize: 30, lineHeight: 32 },
  nav: { padding: spacing.md, paddingBottom: spacing.xxl },
  // The website's burger links: heading font, hairline between them.
  link: { minHeight: 56, justifyContent: 'center' as const, borderBottomWidth: 1, borderBottomColor: c.border },
  linkText: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.lg, letterSpacing: 0.3 },
  linkActive: { color: c.accent },
  secondary: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const },
  secondaryText: { color: c.textSecondary, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  lang: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.border },
});

interface MenuDrawerProps {
  visible: boolean;
  categories: Category[];
  activeCategoryId: string | null;
  user: AuthUser | null;
  onClose: () => void;
  onCategory: (category: Category) => void;
  onAbout: () => void;
  onAccount: () => void;
  onRequestLogout: () => void;
}

/** The website's burger menu: "Меню" + ×, every category, "О нас", account / sign-in, and the language switch. */
export function MenuDrawer({ visible, categories, activeCategoryId, user, onClose, onCategory, onAbout, onAccount, onRequestLogout }: MenuDrawerProps) {
  const s = useThemedStyles(styles);
  const { t, i18n } = useTranslation();
  const { categoryName } = useLabels();
  const insets = useSafeAreaInsets();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'ru';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.header}>
          <Text style={s.title} accessibilityRole="header">
            {t('menu.title')}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('menu.close')} onPress={onClose} style={s.close}>
            <Text style={s.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.nav}>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="link"
              accessibilityLabel={categoryName(category)}
              accessibilityState={{ selected: category.id === activeCategoryId }}
              onPress={() => onCategory(category)}
              style={s.link}
            >
              <Text style={[s.linkText, category.id === activeCategoryId && s.linkActive]}>{categoryName(category)}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="link" accessibilityLabel={t('header.about')} onPress={onAbout} style={s.link}>
            <Text style={s.linkText}>{t('header.about')}</Text>
          </Pressable>

          {user ? (
            <>
              <Pressable accessibilityRole="link" accessibilityLabel={user.name} onPress={onAccount} style={s.secondary}>
                <Text style={s.secondaryText} numberOfLines={1}>
                  {user.name}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('header.logout')} onPress={onRequestLogout} style={s.secondary}>
                <Text style={s.secondaryText}>{t('header.logout')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="link" accessibilityLabel={t('header.login')} onPress={onAccount} style={s.secondary}>
              <Text style={s.secondaryText}>{t('header.login')}</Text>
            </Pressable>
          )}

          <View style={s.lang}>
            <Segmented<Language>
              value={language}
              onChange={(next) => void setLanguage(next)}
              options={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_META[code].name }))}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
