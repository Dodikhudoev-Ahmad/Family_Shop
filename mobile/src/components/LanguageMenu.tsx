import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { isLanguage, LANGUAGE_META, LANGUAGES, setLanguage, type Language } from '../i18n';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  trigger: { minWidth: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 3, paddingHorizontal: spacing.xs },
  code: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, letterSpacing: 0.4 },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute' as const,
    minWidth: 168,
    backgroundColor: c.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingHorizontal: spacing.md },
  itemCode: { width: 26, color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.xs },
  itemName: { flex: 1, color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  itemActive: { color: c.accent },
});

/** "RU ▾": the website's compact language dropdown. Switching is instant and remembered (fs.lang.v2). */
export function LanguageMenu({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const current: Language = isLanguage(i18n.language) ? i18n.language : 'ru';
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 4, right: Math.max(spacing.sm, width - (x + w)) });
      onOpenChange?.(true);
    });
  };
  const close = () => {
    setAnchor(null);
    onOpenChange?.(false);
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={t('language.label')}
        accessibilityState={{ expanded: anchor !== null }}
        onPress={open}
        style={s.trigger}
      >
        <Text style={s.code}>{LANGUAGE_META[current].code}</Text>
        <Ionicons name={anchor ? 'chevron-up' : 'chevron-down'} size={13} color={colors.text} />
      </Pressable>

      <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={close}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.backdrop} onPress={close} />
        {anchor ? (
          <View style={[s.menu, { top: anchor.top, right: anchor.right }]} accessibilityRole="menu">
            {LANGUAGES.map((lang) => (
              <Pressable
                key={lang}
                accessibilityRole="menuitem"
                accessibilityLabel={LANGUAGE_META[lang].name}
                accessibilityState={{ selected: lang === current }}
                onPress={() => {
                  close();
                  void setLanguage(lang);
                }}
                style={s.item}
              >
                <Text style={[s.itemCode, lang === current && s.itemActive]}>{LANGUAGE_META[lang].code}</Text>
                <Text style={[s.itemName, lang === current && s.itemActive]}>{LANGUAGE_META[lang].name}</Text>
                {lang === current ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}
