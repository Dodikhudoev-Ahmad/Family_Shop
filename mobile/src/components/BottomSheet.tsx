import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' as const },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingLeft: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.lg },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  closeText: { color: c.text, fontSize: 26, lineHeight: 28 },
  body: { padding: spacing.md, gap: spacing.lg },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg },
});

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body (the primary action). */
  footer?: ReactNode;
}

/** Modal sheet that slides up from the bottom, never taller than 85% of the screen, safe-area aware. */
export function BottomSheet({ visible, title, onClose, children, footer }: BottomSheetProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[s.sheet, { maxHeight: height * 0.85 }]}>
          <View style={s.header}>
            <Text style={s.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.close}>
              <Text style={s.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>{footer}</View> : <View style={{ height: insets.bottom }} />}
        </View>
      </View>
    </Modal>
  );
}
