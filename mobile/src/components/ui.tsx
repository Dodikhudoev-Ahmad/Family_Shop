import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const buttonStyles = (c: ColorTokens) => ({
  base: {
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  primary: { backgroundColor: c.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  primaryText: { color: c.white, fontFamily: fonts.bodySemibold, fontSize: fontSizes.md },
  secondaryText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
});

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  /** Spoken label when the visible one is just a glyph (e.g. a heart). Defaults to `label`. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, accessibilityLabel, style }: ButtonProps) {
  const styles = useThemedStyles(buttonStyles);
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.base, variant === 'primary' ? styles.primary : styles.secondary, inactive && styles.disabled, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.accent} /> : null}
      <Text style={variant === 'primary' ? styles.primaryText : styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const messageStyles = (c: ColorTokens) => ({
  wrap: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl, gap: spacing.md },
  text: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, textAlign: 'center' as const },
});

/** Loading / empty / error placeholder, optionally with a retry button. */
export function StateMessage({ message, loading = false, actionLabel, onAction }: { message?: string; loading?: boolean; actionLabel?: string; onAction?: () => void }) {
  const styles = useThemedStyles(messageStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {loading ? <ActivityIndicator color={colors.accent} size="large" accessibilityLabel={message} /> : null}
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const logoStyles = (c: ColorTokens) => ({
  text: { fontFamily: fonts.headingBold, fontSize: fontSizes.xl, color: c.text, letterSpacing: -0.4 },
  accent: { color: '#C17A54' },
});

/** The FamilyShop wordmark: F and S in terracotta. */
export function Logo() {
  const styles = useThemedStyles(logoStyles);
  return (
    <Text style={styles.text} accessibilityRole="header">
      <Text style={styles.accent}>F</Text>amily<Text style={styles.accent}>S</Text>hop
    </Text>
  );
}

const segmentStyles = (c: ColorTokens) => ({
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.sm,
  },
  active: { backgroundColor: c.accent, borderColor: c.accent },
  text: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  activeText: { color: c.white },
});

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A row of mutually exclusive pill buttons (theme and language pickers, delivery method). */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void }) {
  const styles = useThemedStyles(segmentStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.item, selected && styles.active]}
          >
            <Text numberOfLines={1} style={[styles.text, selected && styles.activeText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const screenStyles = (c: ColorTokens) => ({ root: { flex: 1, backgroundColor: c.bg } });

export function Screen({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(screenStyles);
  return <View style={styles.root}>{children}</View>;
}
